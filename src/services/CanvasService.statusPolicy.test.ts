// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): getStatus() reads `window`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Action, DP1Call, DP1Item, DP1License } from '@/models/dp1.model';

const item = (id: string): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
});

const status = () => canvasService.processMessage({
  command: CastCommand.displayPlaylist,
  request: { intent: { action: DP1Action.GetCurrentPlaylist } },
}) as { ok: boolean; playlist?: DP1Call; index?: number; castCommand?: string };

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  await contentPolicyStore.initialize();
});

afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
  vi.restoreAllMocks();
});

describe('checkStatus and content policy admission', () => {
  it('does not log recurring status polls as player activity', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    canvasService.processMessage({ command: CastCommand.checkStatus });
    canvasService.processMessage({ command: CastCommand.checkStatus });

    expect(
      log.mock.calls.filter(([message]) => message === '[CAST] commandHandler:')
    ).toHaveLength(0);
  });

  it('does not repeatedly hydrate a cached cast rejected by policy', async () => {
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    vi.spyOn(DeviceManager, 'getCachedCastInfo').mockReturnValue({
      castCommand: CastCommand.displayPlaylist,
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [item('blocked')] },
    });
    canvasService.setCastInfo(null, false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    canvasService.processMessage({ command: CastCommand.checkStatus });
    canvasService.processMessage({ command: CastCommand.checkStatus });

    expect(
      log.mock.calls.filter(([message]) => message === '[CanvasService] Setting castInfo:')
    ).toHaveLength(1);
  });

  it('never reports a persisted cast the policy filtered away as active', async () => {
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    vi.spyOn(DeviceManager, 'getCachedCastInfo').mockReturnValue({
      castCommand: CastCommand.displayPlaylist,
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [item('unrated')] },
    });
    canvasService.setCastInfo(null, false);

    const reply = status();

    // Hydration correctly reduced the persisted cast to nothing. Falling back
    // to the stored payload would tell a controller that blocked artwork, its
    // index and its command are current while the wall shows nothing.
    expect(reply.ok).toBe(true);
    expect(reply.playlist).toBeUndefined();
    expect(reply.index).toBeUndefined();
    expect(reply.castCommand).toBeUndefined();
  });

  it('reports the cast it is still playing under the fallback default', () => {
    canvasService.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [item('a')] },
    }, false);
    vi.spyOn(contentPolicyStore, 'getSnapshot').mockReturnValue({
      policy: DEFAULT_CONTENT_POLICY, active: false, epoch: 1, retireEpoch: 0,
      hydrationFailed: true,
    });

    // An unreadable mirror puts the built-in default in force rather than
    // stopping playback, so the device IS showing this work and must say so.
    // The daemon learns the mirror is not durable from the policy reply's
    // active:false, not by the player pretending nothing is playing.
    expect(canvasService.hasActiveArtwork()).toBe(true);
    const reply = status();
    expect(reply.ok).toBe(true);
    expect(reply.playlist?.items?.map(value => value.id)).toEqual(['a']);
    expect(reply.index).toBe(0);
  });

  it('still reports a persisted cast the policy allows', () => {
    const allowed = { ...item('allowed'), contentRating: 'general' as const };
    vi.spyOn(DeviceManager, 'getCachedCastInfo').mockReturnValue({
      castCommand: CastCommand.displayPlaylist,
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [allowed] },
    });
    canvasService.setCastInfo(null, false);

    const reply = status();

    expect(reply.ok).toBe(true);
    expect(reply.playlist?.items?.map(value => value.id)).toEqual(['allowed']);
    expect(reply.castCommand).toBe(CastCommand.displayPlaylist);
  });
});
