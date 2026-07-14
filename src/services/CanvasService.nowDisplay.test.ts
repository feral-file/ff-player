import { RenderStatus, CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (
  id: string,
  items: DP1Item[],
  playlistDefaults?: DP1Call['defaults']
): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  defaults: playlistDefaults,
  items,
});

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { pathname: '/playlist' },
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  canvasService.setCastInfo(null, false);
});

it('resets loop and shuffle when a fresh Now Display playlist is applied', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('old', ['A'].map(item)),
      index: 0,
      shuffle: true,
      loopMode: LoopMode.none,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('new', ['B', 'C'].map(item)),
    },
  });

  expect(reply).toEqual({ ok: true });
  const next = canvasService.getCastInfo();
  expect(next?.shuffle).toBe(false);
  expect(next?.loopMode).toBe(LoopMode.playlist);
  expect(next?.playlist?.items?.map(entry => entry.id)).toEqual(['B', 'C']);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('preserves render status in cast info and status replies', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('active', ['A'].map(item)),
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.ready);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);

  canvasService.setRenderStatus(RenderStatus.loading);

  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.loading);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
});

it('returns ok:false when a playlist item source uses an unsupported URL', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('old', ['A'].map(item)),
      index: 0,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('new', [
        {
          id: 'bad-1',
          title: 'Broken Source',
          source: 'invalid://source',
          license: {},
        } as DP1Item,
      ]),
    },
  });

  expect(reply).toEqual({ ok: false });
  expect(canvasService.getCastInfo()?.castCommand).toBe(
    CastCommand.displayPlaylist
  );
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
  ).toEqual(['A']);
  expect(canvasService.getStatus().renderStatus).toBeUndefined();
});
