import { CastCommand, RenderStatus } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import DP1ScheduleService from './DP1ScheduleService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

/** Keeps schedule rejection assertions tied to the active playback contract. */
function expectActivePlaylist(): void {
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
  ).toEqual(['A']);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { pathname: '/playlist' } } as never);
});

afterEach(() => {
  canvasService.setCastInfo(null, false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['invalid://source', 'about:blank'])(
  'returns ok:false for schedule_play when an item source is unsupported: %s',
  source => {
    const storeSpy = vi
      .spyOn(DP1ScheduleService, 'storeScheduledTask')
      .mockResolvedValue(undefined);
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('old', ['A'].map(item)),
        index: 0,
        renderStatus: RenderStatus.ready,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2099-01-01T00:00:00Z',
        },
        dp1_call: playlist('scheduled', [
          { id: 'bad-schedule', source, license: {} } as DP1Item,
        ]),
      },
    });

    expect(reply).toEqual({ ok: false });
    expect(storeSpy).not.toHaveBeenCalled();
    expectActivePlaylist();
  }
);

it('stores a schedule_play task when item sources are supported', () => {
  const storeSpy = vi
    .spyOn(DP1ScheduleService, 'storeScheduledTask')
    .mockResolvedValue(undefined);
  const scheduledPlaylist = playlist('scheduled', ['B'].map(item));

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2099-01-01T00:00:00Z',
        },
        dp1_call: scheduledPlaylist,
      },
    })
  ).toEqual({ ok: true });
  expect(storeSpy).toHaveBeenCalledWith(
    scheduledPlaylist,
    '2099-01-01T00:00:00'
  );
});
