import DeviceManager from '@/utils/DeviceManager';
import { ContentPolicy, DEFAULT_CONTENT_POLICY, parseContentPolicy } from './contentPolicy';

/** Strict persistence boundary: an unreadable record must throw, not look absent. */
interface PolicyStorage { read(): Promise<string | null>; write(value: string): Promise<void> }

/** Stable snapshot for React's external-store subscription and admission checks. */
export interface ContentPolicySnapshot {
  policy: Readonly<ContentPolicy>;
  active: boolean;
  epoch: number;
}

/**
 * Player-side mirror of daemon-owned policy. Hydration and all writes serialize;
 * only durable success publishes a new snapshot. Renderers stay gated when a
 * record is unreadable, and a later daemon reconciliation can repair the mirror.
 */
export class ContentPolicyStore {
  private snapshot: ContentPolicySnapshot = { policy: DEFAULT_CONTENT_POLICY, active: false, epoch: 0 };
  private readonly listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private pending: Promise<void> = Promise.resolve();

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
      this.publish(raw === null ? DEFAULT_CONTENT_POLICY : parseContentPolicy(JSON.parse(raw)));
    } catch {
      // The daemon can recover via set(). Never translate corruption to the
      // permissive pre-audit defaults, nor erase the last recovery snapshot.
    }
  }

  /** Resolve only when the complete validated policy is durable and applied. */
  set(raw: unknown): Promise<void> {
    const policy = parseContentPolicy(raw);
    const next = this.pending.then(async () => {
      await this.initialize();
      await this.storage.write(JSON.stringify(policy));
      this.publish(policy);
    });
    this.pending = next.catch(() => undefined);
    return next;
  }

  /** Retire outgoing media when fresh labels block the current work. */
  retireRendering(): void {
    this.snapshot = { ...this.snapshot, epoch: this.snapshot.epoch + 1 };
    this.listeners.forEach(listener => { listener(); });
  }

  private publish(policy: Readonly<ContentPolicy>): void {
    if (this.snapshot.active && JSON.stringify(this.snapshot.policy) === JSON.stringify(policy)) {return;}
    this.snapshot = { policy: Object.freeze({ ...policy }), active: true, epoch: this.snapshot.epoch + 1 };
    this.listeners.forEach(listener => { listener(); });
  }
}

/** One mirror per player document, reconciled by the daemon after navigation. */
export const contentPolicyStore = new ContentPolicyStore({
  read: () => DeviceManager.getContentPolicyRecord(),
  write: value => DeviceManager.setContentPolicyRecord(value),
});
