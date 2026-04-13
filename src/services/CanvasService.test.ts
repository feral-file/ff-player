import { NO_DURATION_VALUE } from '@/constants';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it } from 'vitest';
import { canvasService } from './CanvasService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const defaults = (background: string): NonNullable<DP1Call['defaults']> => ({
  display: { background },
  license: {} as NonNullable<DP1Call['defaults']>['license'],
  duration: 10,
});

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

const service = canvasService as unknown as {
  refreshPlaylist(newItems: DP1Item[] | undefined): { ok: boolean };
  deferredRefreshPlaylist: DP1Call | null;
  originalPlaylistItems: DP1Item[] | null;
  castInfo: CastInfo | null;
};

describe('CanvasService deferred refresh', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    service.deferredRefreshPlaylist = null;
    service.originalPlaylistItems = null;
  });

  it('defers refresh when the current item is absent from the new playlist', () => {
    const oldPlaylist = playlist('old', ['A', 'B', 'C'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: oldPlaylist,
        index: 1,
      },
      false
    );

    const refreshedPlaylist = playlist(
      'new',
      ['A', 'C', 'D'].map(item),
      defaults('blue')
    );
    service.refreshPlaylist(refreshedPlaylist.items);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);
    expect(canvasService.getQueuedPlaylistItems()?.map(entry => entry.id)).toEqual([
      'A',
      'C',
      'D',
    ]);

    const castInfo = canvasService.getCastInfo();
    expect(castInfo?.castCommand).toBe(CastCommand.refreshPlaylist);
    expect(castInfo?.playlist?.items?.map(entry => entry.id)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(castInfo?.playlist?.defaults).toEqual(oldPlaylist.defaults);
    expect(castInfo?.index).toBe(1);

    const consumed = canvasService.consumeDeferredRefreshPlaylist(0);
    expect(consumed?.items?.map(entry => entry.id)).toEqual(['A', 'C', 'D']);
    expect(consumed?.defaults).toEqual(oldPlaylist.defaults);
    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
      'A',
      'C',
      'D',
    ]);
    expect(canvasService.getCastInfo()?.playlist?.defaults).toEqual(
      oldPlaylist.defaults
    );
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  it('rejects refresh when there is no active playlist', () => {
    const result = service.refreshPlaylist(['A', 'B'].map(item));

    expect(result).toEqual({ ok: false });
    expect(canvasService.getCastInfo()).toBeNull();
    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
  });

  it('remaps the current index immediately when the item still exists', () => {
    const oldPlaylist = playlist('old', ['A', 'B', 'C'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: oldPlaylist,
        index: 2,
      },
      false
    );

    const refreshedPlaylist = playlist(
      'new',
      ['C', 'A', 'D'].map(item),
      defaults('blue')
    );
    service.refreshPlaylist(refreshedPlaylist.items);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
      'C',
      'A',
      'D',
    ]);
    expect(canvasService.getCastInfo()?.playlist?.defaults).toEqual(
      oldPlaylist.defaults
    );
    expect(canvasService.getCastInfo()?.index).toBe(0);
    expect(canvasService.getCastInfo()?.castCommand).toBe(
      CastCommand.refreshPlaylist
    );
  });

  it('ignores semantically unchanged refresh payloads after normalization', () => {
    const currentPlaylist = playlist('same', ['A', 'B'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: {
          ...currentPlaylist,
          items: currentPlaylist.items?.map(entry => ({
            ...entry,
            duration: entry.duration ?? NO_DURATION_VALUE,
          })),
        },
        index: 0,
      },
      false
    );

    service.refreshPlaylist(playlist('same', ['A', 'B'].map(item), defaults('blue')).items);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.castCommand).toBe(
      CastCommand.displayPlaylist
    );
    expect(canvasService.getCastInfo()?.playlist).toEqual({
      ...currentPlaylist,
      items: currentPlaylist.items?.map(entry => ({
        ...entry,
        duration: entry.duration ?? NO_DURATION_VALUE,
      })),
    });
  });

  it('ignores refresh payloads when only non-item metadata changes', () => {
    const currentPlaylist = playlist('same', ['A', 'B'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: {
          ...currentPlaylist,
          items: currentPlaylist.items?.map(entry => ({
            ...entry,
            duration: entry.duration ?? NO_DURATION_VALUE,
          })),
        },
        index: 1,
      },
      false
    );

    service.refreshPlaylist(
      playlist('same', ['A', 'B'].map(item), defaults('red')).items
    );

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.castCommand).toBe(
      CastCommand.displayPlaylist
    );
    expect(canvasService.getCastInfo()?.playlist).toEqual({
      ...currentPlaylist,
      items: currentPlaylist.items?.map(entry => ({
        ...entry,
        duration: entry.duration ?? NO_DURATION_VALUE,
      })),
    });
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('treats legacy undefined durations as a no-op after normalization', () => {
    const currentPlaylist = playlist('legacy', ['A', 'B'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: currentPlaylist,
        index: 1,
      },
      false
    );

    service.refreshPlaylist(playlist('legacy', ['A', 'B'].map(item), defaults('blue')).items);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.castCommand).toBe(
      CastCommand.displayPlaylist
    );
    expect(canvasService.getCastInfo()?.playlist).toEqual(currentPlaylist);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('keeps defaults unset when item-only refresh updates the list', () => {
    const currentPlaylist = playlist('same', ['A', 'B'].map(item));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: {
          ...currentPlaylist,
          items: currentPlaylist.items?.map(entry => ({
            ...entry,
            duration: entry.duration ?? NO_DURATION_VALUE,
          })),
        },
        index: 0,
      },
      false
    );

    service.refreshPlaylist(playlist('new', ['A', 'C'].map(item), defaults('blue')).items);

    expect(canvasService.getCastInfo()?.playlist?.defaults).toBeUndefined();
    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
  });

  it('clears stale deferred refresh state when a later refresh is a no-op', () => {
    const currentPlaylist = playlist(
      'current',
      ['A', 'B', 'C'].map(item),
      defaults('red')
    );
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: {
          ...currentPlaylist,
          items: currentPlaylist.items?.map(entry => ({
            ...entry,
            duration: entry.duration ?? NO_DURATION_VALUE,
          })),
        },
        index: 1,
      },
      false
    );

    service.refreshPlaylist(
      playlist('deferred', ['A', 'C', 'D'].map(item), defaults('blue')).items
    );
    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

    service.refreshPlaylist(
      playlist('noop', ['A', 'B', 'C'].map(item), defaults('red')).items
    );

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.consumeDeferredRefreshPlaylist(0)).toBeNull();
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(canvasService.getCastInfo()?.castCommand).toBe(
      CastCommand.refreshPlaylist
    );
  });
});
