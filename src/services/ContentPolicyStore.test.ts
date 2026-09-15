import { describe, expect, it, vi } from 'vitest';
import { ContentPolicyStore } from './ContentPolicyStore';
import { ContentPolicy, DEFAULT_CONTENT_POLICY } from './contentPolicy';

describe('persisted content policy', () => {
  it('holds rendering until hydration, then supplies explicit defaults', async () => {
    const store = new ContentPolicyStore({ read: () => Promise.resolve(null), write: () => Promise.resolve() });
    expect(store.getSnapshot().active).toBe(false);
    await store.initialize();
    expect(store.getSnapshot()).toMatchObject({ active: true, policy: DEFAULT_CONTENT_POLICY });
  });

  it('a missing record is distinct from unreadable or corrupt storage', async () => {
    for (const read of [() => Promise.resolve('{bad json'), () => Promise.reject(new Error('disk'))]) {
      const store = new ContentPolicyStore({ read, write: () => Promise.resolve() });
      await store.initialize();
      expect(store.getSnapshot().active).toBe(false);
    }
  });

  it('does not acknowledge or apply failed writes and allows a later retry', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const store = new ContentPolicyStore({ read: () => Promise.resolve(null), write });
    await store.initialize();
    const policy = { ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true };
    await expect(store.set(policy)).rejects.toThrow('quota');
    expect(store.getSnapshot().policy).toEqual(DEFAULT_CONTENT_POLICY);
    await store.set(policy);
    expect(store.getSnapshot().policy).toEqual(policy);
  });

});

describe('content policy hydration and writes racing', () => {
  it('never publishes the stale mirror ahead of a write already in flight', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    const store = new ContentPolicyStore({
      read: () => new Promise<string | null>(resolve => { finishRead = resolve; }),
      write: () => Promise.resolve(),
    });
    const published: boolean[] = [];
    store.subscribe(() => { published.push(store.getSnapshot().policy.showMatureContent); });

    void store.initialize();
    const write = store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });
    finishRead(null);
    await write;

    // Publishing the hydrated default first would reconcile the live cast
    // against a policy already known to be obsolete, and a mature work admitted
    // under the incoming opt-in would be retired before that opt-in applied.
    expect(published).toEqual([true]);
    expect(store.getSnapshot().policy.showMatureContent).toBe(true);
  });

  it('lets the hydrated mirror through when the write it waited for fails', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    const store = new ContentPolicyStore({
      read: () => new Promise<string | null>(resolve => { finishRead = resolve; }),
      write: () => Promise.reject(new Error('quota')),
    });

    void store.initialize();
    const write = store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });
    finishRead(null);
    await expect(write).rejects.toThrow('quota');

    // The record is unchanged, so what hydration read still describes it.
    // Staying inactive would leave admission with no policy to apply at all.
    expect(store.getSnapshot()).toMatchObject({ active: true, policy: DEFAULT_CONTENT_POLICY });
  });

});

describe('content policy write precedence and recovery', () => {
  it('a read that fails after a successful write cannot invalidate that policy', async () => {
    let failRead: (error: Error) => void = () => undefined;
    const store = new ContentPolicyStore({
      read: () => new Promise<string | null>((unused, reject) => { failRead = reject; }),
      write: () => Promise.resolve(),
    });

    void store.initialize();
    await store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });
    failRead(new Error('disk'));
    await Promise.resolve();
    await Promise.resolve();

    // The record this read failed on has already been replaced. Marking the
    // mirror unreadable now would make the player refuse every cast on a device
    // the daemon was just told is configured.
    expect(store.getSnapshot()).toMatchObject({ active: true, hydrationFailed: false });
  });

  it('clears an unreadable mirror even when the daemon resends the same policy', async () => {
    const store = new ContentPolicyStore({
      read: () => Promise.reject(new Error('disk')),
      write: () => Promise.resolve(),
    });
    await store.initialize();
    expect(store.getSnapshot().hydrationFailed).toBe(true);

    await store.set(DEFAULT_CONTENT_POLICY);

    // A durable write proves the mirror is usable again. Recovery must not
    // depend on the daemon happening to pick a different policy.
    expect(store.getSnapshot()).toMatchObject({ active: true, hydrationFailed: false });
  });

  it('keeps hydration held while a later write is still queued', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    const writes = [
      () => Promise.reject(new Error('quota')),
      () => Promise.resolve(),
    ];
    const store = new ContentPolicyStore({
      read: () => new Promise<string | null>(resolve => { finishRead = resolve; }),
      write: () => (writes.shift() ?? (() => Promise.resolve()))(),
    });
    const published: ContentPolicy[] = [];
    store.subscribe(() => { published.push(store.getSnapshot().policy); });

    void store.initialize();
    const first = store.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });
    const second = store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });
    finishRead(null);
    await expect(first).rejects.toThrow('quota');
    await second;

    // The failed write must not release the held mirror while a later write is
    // still queued: that stale publish reconciles the live cast against a
    // policy already superseded, and can clear it before the final, more
    // permissive policy arrives with nothing left to resume.
    expect(published).toEqual([{ ...DEFAULT_CONTENT_POLICY, showMatureContent: true }]);
  });

  it('a read that lands after a successful write cannot revert it', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    const store = new ContentPolicyStore({
      read: () => new Promise<string | null>(resolve => { finishRead = resolve; }),
      write: () => Promise.resolve(),
    });

    void store.initialize();
    await store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });
    // The read finally returns the record the write already replaced.
    finishRead(JSON.stringify(DEFAULT_CONTENT_POLICY));
    await Promise.resolve();
    await Promise.resolve();

    // Publishing it would silently revert a setting the daemon was told is
    // active, and for a family-content policy the revert direction is the
    // permissive one.
    expect(store.getSnapshot().policy.showMatureContent).toBe(true);
  });

  it('serializes changes and reads the committed policy after a restart', async () => {
    let raw: string | null = null;
    const storage = { read: () => Promise.resolve(raw), write: (value: string) => { raw = value; return Promise.resolve(); } };
    const store = new ContentPolicyStore(storage);
    await Promise.all([
      store.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true }),
      store.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true }),
    ]);
    const restarted = new ContentPolicyStore(storage);
    await restarted.initialize();
    expect(restarted.getSnapshot().policy.strictPersonal).toBe(true);
    expect(restarted.getSnapshot().policy.showMatureContent).toBe(false);
  });
});
