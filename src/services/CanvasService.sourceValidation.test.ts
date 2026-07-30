import { CastCommand } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('CanvasService malformed source rejection', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
  });

  it.each(['%ZZ', '%A', '%2'])(
    'rejects malformed data escape %s without replacing active playback',
    malformedEscape => {
      canvasService.setCastInfo(
        {
          castCommand: CastCommand.displayPlaylist,
          playlist: playlist('active', ['A'].map(item)),
          index: 0,
        },
        false
      );

      const reply = canvasService.processMessage({
        command: CastCommand.displayPlaylist,
        request: {
          intent: { action: DP1Action.NowDisplay },
          dp1_call: playlist('invalid', [
            {
              id: 'invalid-data',
              source: `data:image/svg+xml,${malformedEscape}`,
              license: {},
            } as DP1Item,
          ]),
        },
      });

      expect(reply).toEqual({ ok: false });
      expect(canvasService.getCastInfo()?.playlist?.id).toBe('active');
    }
  );
});

describe('CanvasService rejected source state preservation', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
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
