import { describe, expect, it, vi } from 'vitest';
import { ContentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';

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
