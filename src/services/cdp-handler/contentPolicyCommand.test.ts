import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from '@/utils/DeviceManager';
import { DEFAULT_CONTENT_POLICY } from '../contentPolicy';
import { contentPolicyStore } from '../ContentPolicyStore';
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
