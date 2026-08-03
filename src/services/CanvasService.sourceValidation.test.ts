import { LocalStorageItem } from '@/constants';
import { CastCommand } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import DP1ScheduleService from './DP1ScheduleService';
import DeviceManager from '@/utils/DeviceManager';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

describe('CanvasService source validation', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
  });

  it.each([
    ['relative', 'artwork.jpg'],
    ['protocol-relative', '//cdn.example.com/artwork.jpg'],
    ['data', 'data:image/svg+xml,%3Csvg%20/%3E'],
    ['default-media-type data', 'data:,hello'],
  ])('accepts a valid %s source at Now Display', (_kind, source) => {
    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: playlist('valid', [
          { id: 'valid-source', source, license: {} } as DP1Item,
        ]),
      },
    });

    expect(reply).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(source);
  });
});

describe('CanvasService data URL validation', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
  });

  it.each(['100%foo', '100%?', '%ZZ', '%A', '%2'])(
    'accepts a raw non-base64 payload containing %s',
    payload => {
      const reply = canvasService.processMessage({
        command: CastCommand.displayPlaylist,
        request: {
          intent: { action: DP1Action.NowDisplay },
          dp1_call: playlist('invalid', [
            {
              id: 'invalid-data',
              source: `data:image/svg+xml,${payload}`,
              license: {},
            } as DP1Item,
          ]),
        },
      });

      expect(reply).toEqual({ ok: true });
      expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(
        `data:image/svg+xml,${payload}`
      );
    }
  );

  it.each(['TQ==', 'TWE', 'TQ%3D%3D'])(
    'accepts valid base64 payload %s',
    payload => {
      const reply = canvasService.processMessage({
        command: CastCommand.displayPlaylist,
        request: {
          intent: { action: DP1Action.NowDisplay },
          dp1_call: playlist('base64-valid', [
            {
              id: 'base64-valid',
              source: `data:text/plain;base64,${payload}`,
              license: {},
            } as DP1Item,
          ]),
        },
      });

      expect(reply).toEqual({ ok: true });
    }
  );

  it.each(['TQ===', 'T=Q=', 'TQ$=', '%ZZ'])(
    'rejects malformed base64 payload %s',
    payload => {
      const reply = canvasService.processMessage({
        command: CastCommand.displayPlaylist,
        request: {
          intent: { action: DP1Action.NowDisplay },
          dp1_call: playlist('base64-invalid', [
            {
              id: 'base64-invalid',
              source: `data:text/plain;base64,${payload}`,
              license: {},
            } as DP1Item,
          ]),
        },
      });

      expect(reply).toEqual({ ok: false });
    }
  );
});

describe('CanvasService rejected source state preservation', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    vi.restoreAllMocks();
  });

  it.each([
    [
      'Now Display',
      {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: playlist('invalid-now-display', [
          { id: 'invalid-now-display', source: 'about:blank', license: {} } as DP1Item,
        ]),
      },
    ],
    [
      'Schedule Play',
      {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2030-01-01T00:00:00Z',
        },
        dp1_call: playlist('invalid-schedule', [
          { id: 'invalid-schedule', source: 'about:blank', license: {} } as DP1Item,
        ]),
      },
    ],
  ])('keeps the critical-temperature marker for rejected %s', (_kind, request) => {
    const removeSpy = vi
      .spyOn(DeviceManager, 'removeItem')
      .mockResolvedValue(undefined);

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request,
    });

    expect(reply).toEqual({ ok: false });
    expect(removeSpy).not.toHaveBeenCalledWith(LocalStorageItem.criticalTemp);
  });

  it('clears the critical-temperature marker after an accepted Now Display', () => {
    const removeSpy = vi
      .spyOn(DeviceManager, 'removeItem')
      .mockResolvedValue(undefined);

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: playlist('valid-now-display', [item('valid-now-display')]),
      },
    });

    expect(reply).toEqual({ ok: true });
    expect(removeSpy).toHaveBeenCalledWith(LocalStorageItem.criticalTemp);
  });

  it('does not persist a rejected scheduled playlist', () => {
    const storeTask = vi
      .spyOn(DP1ScheduleService, 'storeScheduledTask')
      .mockResolvedValue();

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: {
          action: DP1Action.SchedulePlay,
          schedule_time: '2030-01-01T00:00:00Z',
        },
        dp1_call: playlist('scheduled', [
          { id: 'invalid-schedule', source: 'about:blank', license: {} } as DP1Item,
        ]),
      },
    });

    expect(reply).toEqual({ ok: false });
    expect(storeTask).not.toHaveBeenCalled();
    storeTask.mockRestore();
  });

  it('executes a persisted scheduled playlist without revalidating its source', () => {
    canvasService.executeScheduledDP1Task(
      playlist('legacy-scheduled', [
        { id: 'legacy-artwork', source: 'about:blank', license: {} } as DP1Item,
      ])
    );

    expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(
      'about:blank'
    );
  });

  it('does not replace an active or deferred playlist after rejected refresh', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
      },
      false
    );

    expect(
      canvasService.processMessage({
        command: CastCommand.displayPlaylist,
        request: {
          refresh: true,
          dp1_call: playlist('deferred', ['A', 'C'].map(item)),
        },
      })
    ).toEqual({ ok: true });

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        refresh: true,
        dp1_call: playlist('invalid', [
          { id: 'invalid-refresh', source: 'tezos:invalid', license: {} } as DP1Item,
        ]),
      },
    });

    expect(reply).toEqual({ ok: false });
    expect(canvasService.getCastInfo()?.playlist?.id).toBe('active');
    expect(canvasService.getQueuedPlaylistItems()?.map(entry => entry.id)).toEqual([
      'A',
      'C',
    ]);
  });
});
