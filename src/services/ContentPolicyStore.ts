import DeviceManager from '@/utils/DeviceManager';
import { ContentPolicy, DEFAULT_CONTENT_POLICY, parseContentPolicy } from './contentPolicy';

/** Strict persistence boundary: an unreadable record must throw, not look absent. */
interface PolicyStorage { read(): Promise<string | null>; write(value: string): Promise<void> }

/**
 * How long one hydration attempt may take before the device stops waiting.
 * A stalled IndexedDB open does not reject, so without a bound the first read
 * can hold the policy — and therefore the whole rendering gate — forever.
 * Comfortably longer than a healthy read and shorter than controld's poll.
 */
const HYDRATION_TIMEOUT_MS = 3000;

/** Stable snapshot for React's external-store subscription and admission checks. */
export interface ContentPolicySnapshot {
  policy: Readonly<ContentPolicy>;
  active: boolean;
  epoch: number;
  /**
   * Bumped ONLY when fresh labels force the current work off the screen without
   * its outgoing crossfade. The renderer keys its mount on this rather than on
   * `epoch`: every policy write moves `epoch`, so keying on it remounted and
   * re-rendered allowed artwork whenever any unrelated setting changed, which
   * both reloaded the wall and appended a duplicate Recently played record for
   * a work that never left.
   */
  retireEpoch: number;
  /**
   * True once a hydration attempt finished without producing a policy — an
   * unreadable or corrupt mirror. Distinguishes that from the ordinary
   * not-yet-read state, which is also `active: false` but resolves on its own.
   * Admission needs the difference: an unread mirror is reconciled a moment
   * later by the hydration publish, while an unreadable one never is and must
   * fail closed until the daemon repairs it with setContentPolicy.
   */
  hydrationFailed: boolean;
}

/**
 * Player-side mirror of daemon-owned policy. Hydration and all writes serialize;
 * only durable success publishes a new snapshot. Renderers stay gated when a
 * record is unreadable, and a later daemon reconciliation can repair the mirror.
 */
export class ContentPolicyStore {
  private snapshot: ContentPolicySnapshot = { policy: DEFAULT_CONTENT_POLICY, active: false,
    epoch: 0, retireEpoch: 0, hydrationFailed: false };
  private readonly listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private pending: Promise<void> = Promise.resolve();
  /** What hydration read, whether or not it was published. */
  private hydrated: Readonly<ContentPolicy> | null = null;
  /**
   * How many daemon writes are in flight. Hydration must not publish ahead of
   * any of them, and a failed write may only release the held value once it is
   * the LAST one — otherwise a failure would publish the stale mirror while a
   * later write is still queued, reconciling the cast against a policy that is
   * already superseded and potentially clearing it before the final policy
   * lands with nothing left to resume.
   */
  private outstandingWrites = 0;
  /**
   * A durable write has published. Hydration may never publish again after
   * that, whatever order the read resolves in: the record it read has been
   * replaced, so publishing it would silently revert a setting the daemon was
   * already told is active — and for a family-content policy, reverting to a
   * more permissive value is the worst direction to fail in.
   */
  private writeApplied = false;

  /** Attempt counter, so a read abandoned at timeout cannot publish later. */
  private hydrationGeneration = 0;

  constructor(private readonly storage: PolicyStorage,
    private readonly readTimeoutMs: number = HYDRATION_TIMEOUT_MS) {}

  /** Returns a referentially stable snapshot until a durable change occurs. */
  getSnapshot = (): ContentPolicySnapshot => this.snapshot;

  /** Observes committed policy changes, including the first hydration. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Load before boot restoration. A failed read is NOT memoized: storage can
   * come back (a transient IndexedDB open failure, a quota that clears), and
   * latching the failure for the page lifetime would keep a device on the
   * fallback long after the mirror became readable.
   */
  initialize(): Promise<void> {
    this.initialization ??= this.hydrate();
    return this.initialization;
  }

  private async hydrate(): Promise<void> {
    const generation = ++this.hydrationGeneration;
    try {
      const raw = await this.readWithinTimeout();
      if (generation !== this.hydrationGeneration) {
        // A newer attempt started while this read was outstanding. Whatever it
        // returned describes a mirror that has since been read again.
        return;
      }
      const hydrated = raw === null ? DEFAULT_CONTENT_POLICY : parseContentPolicy(JSON.parse(raw));
      this.hydrated = hydrated;
      // A daemon write already in flight supersedes what the mirror held.
      // Publishing the stale value first would reconcile the live cast against
      // a policy known to be obsolete, and a stricter old value can retire an
      // admitted work that the incoming policy allows — with nothing left to
      // restore when it lands a moment later. Hold it; the write publishes.
      if (this.canPublishHydration()) {
        this.publish(hydrated);
      }
    } catch {
      // Let the next initialize() try again: a read can fail, or simply never
      // answer, because storage was briefly unavailable — and that must not
      // outlive the attempt.
      this.initialization = undefined;
      if (generation !== this.hydrationGeneration) {
        return;
      }
      // A write can land while this read is still outstanding, and the record
      // it failed to read has been replaced since. Do not touch the snapshot
      // then — the applied policy is the truth.
      if (this.snapshot.active) {
        return;
      }
      // Otherwise: nothing assumed, keep playing. `hydrationFailed` puts the
      // built-in default in force (see policyInForce) rather than refusing
      // playback, and leaves `active` false so the daemon can see the mirror is
      // not durable and repair it. Blacking the wall on broken storage is the
      // one outcome that helps nobody: the daemon's repair write lands in the
      // same broken database, so "fail closed" would mean fail forever.
      this.snapshot = { ...this.snapshot, policy: DEFAULT_CONTENT_POLICY, hydrationFailed: true };
      this.listeners.forEach(listener => { listener(); });
    }
  }

  /**
   * One bounded read attempt. A rejection and an expiry are deliberately the
   * same outcome: in both the device has no policy it can trust, and the catch
   * puts the built-in default in force rather than waiting on storage that may
   * never answer.
   */
  private readWithinTimeout(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const expiry = setTimeout(
        () => { reject(new Error('contentPolicyReadTimeout')); }, this.readTimeoutMs);
      this.storage.read().then(
        value => { clearTimeout(expiry); resolve(value); },
        (error: unknown) => {
          clearTimeout(expiry);
          reject(error instanceof Error ? error : new Error('contentPolicyReadFailed'));
        });
    });
  }

  /** Resolve only when the complete validated policy is durable and applied. */
  set(raw: unknown): Promise<void> {
    const policy = parseContentPolicy(raw);
    // Claimed before the write starts, so a hydration that resolves in the
    // meantime holds its value instead of publishing a policy this write is
    // about to replace. The write does not wait on the read: it overwrites the
    // record wholesale, and waiting is what let the stale value reconcile the
    // live cast first.
    this.outstandingWrites += 1;
    const next = this.pending.then(async () => {
      try {
        await this.storage.write(JSON.stringify(policy));
      } catch (error) {
        // The mirror is unchanged, so whatever hydration read still describes
        // it and must be allowed through — otherwise a failed write would
        // leave the store inactive and admission with nothing to apply. Only
        // once no later write is still queued, though.
        this.outstandingWrites -= 1;
        this.releaseSupersededHydration();
        throw error;
      }
      this.outstandingWrites -= 1;
      this.writeApplied = true;
      this.publish(policy);
    });
    this.pending = next.catch(() => undefined);
    return next;
  }

  /** Publish a hydrated value held back for writes that all then failed. */
  private releaseSupersededHydration(): void {
    if (this.hydrated && this.canPublishHydration()) {
      this.publish(this.hydrated);
    }
  }

  /** The mirror may speak only while no write has spoken for it. */
  private canPublishHydration(): boolean {
    return this.outstandingWrites === 0 && !this.writeApplied;
  }

  /** Retire outgoing media when fresh labels block the current work. */
  retireRendering(): void {
    this.snapshot = { ...this.snapshot, epoch: this.snapshot.epoch + 1,
      retireEpoch: this.snapshot.retireEpoch + 1 };
    this.listeners.forEach(listener => { listener(); });
  }

  private publish(policy: Readonly<ContentPolicy>): void {
    if (this.snapshot.active && JSON.stringify(this.snapshot.policy) === JSON.stringify(policy)) {
      // Same policy, so nothing to re-render — but a durable write still proves
      // the mirror is readable again. Without this, resending the CURRENT
      // policy could never clear a failure flag, and recovery would depend on
      // the daemon happening to pick a different one.
      if (this.snapshot.hydrationFailed) {
        this.snapshot = { ...this.snapshot, hydrationFailed: false };
        this.listeners.forEach(listener => { listener(); });
      }
      return;
    }
    // A successful set() after a failed hydration repairs the mirror, so the
    // failure flag clears with the policy that replaced it.
    this.snapshot = { policy: Object.freeze({ ...policy }), active: true,
      epoch: this.snapshot.epoch + 1, retireEpoch: this.snapshot.retireEpoch,
      hydrationFailed: false };
    this.listeners.forEach(listener => { listener(); });
  }
}

/**
 * The policy the device must apply right now, or `null` only while it genuinely
 * cannot judge content yet — the brief window before the first read resolves,
 * where a cast is admitted whole and reconciled when the policy lands.
 *
 * An UNREADABLE mirror is not that window. It puts the built-in default in
 * force (mature hidden, everything else plays) so the wall keeps working, while
 * the snapshot still reports `active: false` because nothing about that policy
 * is durable. Callers should ask this rather than reading `active` when what
 * they need to know is "what am I allowed to show".
 */
export function policyInForce(
  snapshot: ContentPolicySnapshot
): Readonly<ContentPolicy> | null {
  if (snapshot.active) {return snapshot.policy;}
  return snapshot.hydrationFailed ? DEFAULT_CONTENT_POLICY : null;
}

/** One mirror per player document, reconciled by the daemon after navigation. */
export const contentPolicyStore = new ContentPolicyStore({
  read: () => DeviceManager.getContentPolicyRecord(),
  write: value => DeviceManager.setContentPolicyRecord(value),
});
