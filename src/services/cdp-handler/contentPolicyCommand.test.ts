import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from '@/utils/DeviceManager';
import { DEFAULT_CONTENT_POLICY } from '../contentPolicy';
import { contentPolicyStore, ContentPolicyStore } from '../ContentPolicyStore';
import { contentPolicyCommand } from './contentPolicyCommand';

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
});

describe('content policy CDP acknowledgements', () => {
  it('keeps legacy message correlation and waits for durable completion', async () => {
    let commit: () => void = () => undefined;
    vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockImplementation(() =>
      new Promise<void>(resolve => { commit = resolve; }));
    const policy = { ...DEFAULT_CONTENT_POLICY, strictPersonal: true };
    let completed = false;
    const result = contentPolicyCommand('setContentPolicy', { contentPolicy: policy }, 'request-1');
    void result.then(() => { completed = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(contentPolicyStore.getSnapshot().policy.strictPersonal).toBe(false);
    commit();
    expect(JSON.parse(await result)).toEqual({ messageID: 'request-1',
      message: { ok: true, active: true, contentPolicy: policy } });
    expect(JSON.parse(await contentPolicyCommand('getContentPolicy', {}))).toEqual({ message: {
      ok: true, active: true, contentPolicy: policy,
    } });
  });

  it('never acknowledges activation on storage failure', async () => {
    vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockRejectedValue(new Error('quota'));
    const result = await contentPolicyCommand('setContentPolicy', {
      contentPolicy: { ...DEFAULT_CONTENT_POLICY, showMatureContent: true },
    });
    expect(JSON.parse(result)).toEqual({ message: { ok: false, error: 'contentPolicyUnavailable' } });
    expect(contentPolicyStore.getSnapshot().policy.showMatureContent).toBe(false);
  });

  it.each([null, {}, DEFAULT_CONTENT_POLICY, { contentPolicy: null },
    { contentPolicy: { ...DEFAULT_CONTENT_POLICY, strictPersonal: 'true' } }])(
    'rejects malformed envelopes without persistence (%j)', async request => {
      const write = vi.spyOn(DeviceManager, 'setContentPolicyRecord');
      write.mockClear();
      expect(JSON.parse(await contentPolicyCommand('setContentPolicy', request)))
        .toEqual({ message: { ok: false, error: 'invalidContentPolicy' } });
      expect(write).not.toHaveBeenCalled();
    });
});

describe('content policy reads before the mirror is applied', () => {
  it('answers unavailable immediately instead of waiting on a stalled read', async () => {
    const stalled = new ContentPolicyStore({
      read: () => new Promise(() => undefined),
      write: () => Promise.resolve(),
    });
    vi.spyOn(contentPolicyStore, 'getSnapshot').mockImplementation(stalled.getSnapshot);
    const hydrate = vi.spyOn(contentPolicyStore, 'initialize')
      .mockImplementation(() => stalled.initialize());

    // Awaiting hydration would hold this promise for as long as the read takes,
    // and forever if it never resolves, so controld times out rather than
    // receiving the documented retryable reply.
    const result = await Promise.race([
      contentPolicyCommand('getContentPolicy', {}, 'read-1'),
      new Promise<string>(resolve => { setTimeout(() => { resolve('timed out'); }, 50); }),
    ]);

    expect(JSON.parse(result)).toEqual({ messageID: 'read-1',
      message: { ok: false, error: 'contentPolicyUnavailable' } });
    // It still starts hydration, so a later poll can succeed.
    expect(hydrate).toHaveBeenCalled();
  });

  it('reports the degraded fallback as a policy, not as unavailable', async () => {
    const broken = new ContentPolicyStore({
      read: () => Promise.reject(new Error('IndexedDB unavailable')),
      write: () => Promise.resolve(),
    });
    await broken.initialize();
    vi.spyOn(contentPolicyStore, 'getSnapshot').mockImplementation(broken.getSnapshot);
    vi.spyOn(contentPolicyStore, 'initialize').mockImplementation(() => broken.initialize());

    const result = await contentPolicyCommand('getContentPolicy', {}, 'degraded');

    // The device IS enforcing a policy — the built-in default — and is still
    // playing under it. Reporting `contentPolicyUnavailable` would make that
    // indistinguishable from a read that has not finished, and the daemon
    // cannot repair a mirror it has not been told is broken.
    expect(JSON.parse(result)).toEqual({ messageID: 'degraded',
      message: { ok: true, contentPolicy: DEFAULT_CONTENT_POLICY, active: false } });
  });

  it('returns the applied policy once the mirror is active', async () => {
    const result = await contentPolicyCommand('getContentPolicy', {}, 'read-2');

    expect(JSON.parse(result)).toEqual({ messageID: 'read-2',
      message: { ok: true, contentPolicy: DEFAULT_CONTENT_POLICY, active: true } });
  });
});
