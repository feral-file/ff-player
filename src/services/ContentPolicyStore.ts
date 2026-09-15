import DeviceManager from '@/utils/DeviceManager';
import { ContentPolicy, DEFAULT_CONTENT_POLICY, parseContentPolicy } from './contentPolicy';

/** Strict persistence boundary: an unreadable record must throw, not look absent. */
interface PolicyStorage { read(): Promise<string | null>; write(value: string): Promise<void> }

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

  constructor(private readonly storage: PolicyStorage) {}

  /** Returns a referentially stable snapshot until a durable change occurs. */
  getSnapshot = (): ContentPolicySnapshot => this.snapshot;

  /** Observes committed policy changes, including the first hydration. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Load before boot restoration; a read error leaves rendering inactive. */
  initialize(): Promise<void> {
    this.initialization ??= this.hydrate();
    return this.initialization;
  }

  private async hydrate(): Promise<void> {
    try {
      const raw = await this.storage.read();
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
      // The daemon can recover via set(). Never translate corruption to the
      // permissive pre-audit defaults, nor erase the last recovery snapshot.
      // Publishing the failure is what lets admission tell an unreadable
      // mirror apart from one that is merely still being read.
      //
      // Unless a policy is already applied: a write can land while this read is
      // still outstanding, and the record it failed to read has been replaced
      // since. Marking the mirror unreadable then would make displayPlaylist
      // refuse every cast on a device the daemon was just told is configured —
      // a successful activation followed by a player that plays nothing.
      if (this.snapshot.active) {
        return;
      }
      this.snapshot = { ...this.snapshot, hydrationFailed: true };
      this.listeners.forEach(listener => { listener(); });
    }
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

/** One mirror per player document, reconciled by the daemon after navigation. */
export const contentPolicyStore = new ContentPolicyStore({
  read: () => DeviceManager.getContentPolicyRecord(),
  write: value => DeviceManager.setContentPolicyRecord(value),
});
