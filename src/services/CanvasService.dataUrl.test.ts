import { CastCommand, RenderStatus } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import DP1ScheduleService from './DP1ScheduleService';

const activePlaylist: DP1Call = {
  dpVersion: '1',
  id: 'active',
  title: 'Active Playlist',
  items: [
    {
      id: 'active-artwork',
      source: 'https://example.com/active.jpg',
      license: {},
    } as DP1Item,
  ],
};

const malformedDataPlaylist: DP1Call = {
  dpVersion: '1',
  id: 'malformed-data',
  title: 'Malformed Data Playlist',
  items: [
    {
      id: 'malformed-data-artwork',
      source: 'data:;base64,%%%%',
      license: {},
    } as DP1Item,
  ],
};

const invalidBase64DataPlaylist: DP1Call = {
  ...malformedDataPlaylist,
  id: 'invalid-base64-data',
  items: [
    {
      id: 'invalid-base64-artwork',
      source: 'data:;base64,A',
      license: {},
    } as DP1Item,
  ],
};

const validDataPlaylist: DP1Call = {
  ...malformedDataPlaylist,
  id: 'valid-data',
  items: [
    {
      id: 'valid-data-artwork',
      source: 'data:;base64,QQ==%0A#fragment',
      license: {},
    } as DP1Item,
  ],
};

/** Ensures rejected sources leave the currently playing artwork and status intact. */
function expectActivePlayback(): void {
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(item => item.id)
  ).toEqual(['active-artwork']);
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

it('rejects malformed data URLs before Now Display, Schedule Play, or refresh state changes', () => {
  const storeSpy = vi
    .spyOn(DP1ScheduleService, 'storeScheduledTask')
    .mockResolvedValue(undefined);
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: activePlaylist,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: malformedDataPlaylist,
      },
    })
  ).toEqual({ ok: false });
  expectActivePlayback();

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2099-01-01T00:00:00Z',
        },
        dp1_call: malformedDataPlaylist,
      },
    })
  ).toEqual({ ok: false });
  expect(storeSpy).not.toHaveBeenCalled();
  expectActivePlayback();

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: { refresh: true, dp1_call: malformedDataPlaylist },
    })
  ).toEqual({ ok: false });
  expectActivePlayback();
});

it('rejects invalid base64 payloads before Now Display, Schedule Play, or refresh state changes', () => {
  const storeSpy = vi
    .spyOn(DP1ScheduleService, 'storeScheduledTask')
    .mockResolvedValue(undefined);
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: activePlaylist,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: invalidBase64DataPlaylist,
      },
    })
  ).toEqual({ ok: false });
  expectActivePlayback();

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2099-01-01T00:00:00Z',
        },
        dp1_call: invalidBase64DataPlaylist,
      },
    })
  ).toEqual({ ok: false });
  expect(storeSpy).not.toHaveBeenCalled();
  expectActivePlayback();

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: { refresh: true, dp1_call: invalidBase64DataPlaylist },
    })
  ).toEqual({ ok: false });
  expectActivePlayback();
});

it('accepts valid base64 data URLs with encoded whitespace and fragments', () => {
  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: validDataPlaylist,
      },
    })
  ).toEqual({ ok: true });
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(item => item.id)
  ).toEqual(['valid-data-artwork']);
});

it('accepts non-base64 data URLs with raw percent characters', () => {
  const rawPercentDataPlaylist: DP1Call = {
    ...validDataPlaylist,
    id: 'raw-percent-data',
    items: [
      {
        id: 'raw-percent-artwork',
        source: 'data:image/svg+xml,<svg width="100%"/>',
        license: {},
      } as DP1Item,
    ],
  };

  expect(
    canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: rawPercentDataPlaylist,
      },
    })
  ).toEqual({ ok: true });
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(item => item.id)
  ).toEqual(['raw-percent-artwork']);
});
