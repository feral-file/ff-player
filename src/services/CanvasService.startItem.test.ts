import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import {
  DP1Action,
  DP1License,
  type DP1Call,
  type DP1Item,
} from '@/models/dp1.model';

const item = (id: string, contentRating?: 'general' | 'mature'): DP1Item => ({
  id,
  source: `https://art.test/${id}`,
  license: DP1License.Open,
  ...(contentRating ? { contentRating } : {}),
});
const playlist = (...items: DP1Item[]): DP1Call => ({
  dpVersion: '1.1.0',
  title: 'Set',
  items,
});
const cast = (dp1_call: DP1Call, extra = {}, action = DP1Action.NowDisplay) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: { intent: { action }, dp1_call, ...extra },
  });
const showing = () => {
  const info = canvasService.getCastInfo();
  return info?.playlist?.items?.[info.index ?? 0]?.id;
};

beforeEach(async () => {
  vi.stubGlobal('window', { location: { pathname: '/playlist' } } as never);
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(
    undefined
  );
  vi.spyOn(DeviceManager, 'setBootPlaylist').mockResolvedValue(undefined);
  await contentPolicyStore.initialize();
});
afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('displayPlaylist startItem', () => {
  const abc = () => playlist(item('a'), item('b'), item('c'));

  it('opens the cast on the named work and keeps the list whole', () => {
    expect(cast(abc(), { startItem: { id: 'c' } })).toEqual({ ok: true });
    const info = canvasService.getCastInfo();
    expect(info?.index).toBe(2);
    expect(info?.playlist?.items?.map(entry => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(canvasService.getStatus().index).toBe(2);
  });

  it('counts the position in the list left after content admission', () => {
    const mixed = playlist(item('a', 'mature'), item('b'), item('c'));
    expect(cast(mixed, { startItem: { id: 'c' } })).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.playlist?.items?.map(e => e.id)).toEqual(
      ['b', 'c']
    );
    expect(showing()).toBe('c');
  });

  it('matches by source when the device resolved new ids', () => {
    const start = { id: 'stale-id', source: 'https://art.test/b' };
    expect(cast(abc(), { startItem: start })).toEqual({ ok: true });
    expect(showing()).toBe('b');
  });

  it('starts at the beginning when the work is not in the list', () => {
    expect(cast(abc(), { startItem: { id: 'z' } })).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  it('starts at the beginning when the work was blocked by content policy', () => {
    const mixed = playlist(item('a'), item('b', 'mature'));
    expect(cast(mixed, { startItem: { id: 'b' } })).toEqual({ ok: true });
    expect(showing()).toBe('a');
  });

  it('never rejects a cast over a malformed start work', () => {
    expect(cast(abc(), { startItem: 'c' })).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  it('is ignored on a refresh', () => {
    cast(abc());
    expect(
      cast(abc(), { refresh: true, startItem: { id: 'c' } })?.ok
    ).toBe(true);
    expect(showing()).toBe('a');
  });

  it('is ignored on the boot action', () => {
    expect(
      cast(abc(), { startItem: { id: 'c' } }, DP1Action.DisplayAtBoot)?.ok
    ).toBe(true);
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });
});
