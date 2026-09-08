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
