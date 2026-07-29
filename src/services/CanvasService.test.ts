import { NO_DURATION_VALUE } from '@/constants';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  setShuffle(request: { enabled: boolean }): { ok: boolean };
  deferredRefreshPlaylist: DP1Call | null;
  originalPlaylistItems: DP1Item[] | null;
  castInfo: CastInfo | null;
  queuedPlaylistPending: boolean;
  onRefreshArtwork: (() => boolean) | null;
};

// eslint-disable-next-line max-lines-per-function -- Keep the refreshArtwork scenarios together; they share a compact helper surface.
describe('CanvasService refreshArtwork', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    service.onRefreshArtwork = null;
  });

  it('refreshes artwork without mutating cast command payload', () => {
    const refreshSpy = vi.fn(() => true);
    service.onRefreshArtwork = refreshSpy;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });

    expect(reply).toEqual({ ok: true });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    const next = canvasService.getCastInfo();
    expect(next?.castCommand).toBe(CastCommand.displayPlaylist);
    expect(next?.playlist?.items?.map(entry => entry.id)).toEqual(['A', 'B']);
    expect(next?.index).toBe(1);
  });

  it('returns ok:false when no playlist handler is registered', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
      },
      false
    );
    service.onRefreshArtwork = null;

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({ ok: false });
  });

  it('returns ok:false when the handler cannot apply a preview URL', () => {
    const refreshSpy = vi.fn(() => false);
    service.onRefreshArtwork = refreshSpy;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({ ok: false });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts a relative source path on refreshPlaylist', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
        renderStatus: undefined,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        refresh: true,
        dp1_call: playlist('refreshed', [
          {
            id: 'rel-refresh',
            title: 'Relative Source',
            source: 'artwork.png',
            license: {},
          } as DP1Item,
        ]),
      },
    });

    // Relative sources are cast-acceptable. Current item is absent from the new
    // list, so refresh defers apply and keeps the active playlist until promote.
    expect(reply).toEqual({ ok: true });
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['A', 'B']);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('returns ok:false when refresh receives a non-web source scheme', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
        renderStatus: undefined,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        refresh: true,
        dp1_call: playlist('refreshed', [
          {
            id: 'tezos-refresh',
            title: 'Tezos Source',
            source: 'tezos:KT1example:1',
            license: {},
          } as DP1Item,
        ]),
      },
    });

    expect(reply).toEqual({ ok: false });
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['A', 'B']);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

});

// eslint-disable-next-line max-lines-per-function -- Deferred refresh cases share helpers; split later if this file grows further.
describe('CanvasService deferred refresh', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    service.deferredRefreshPlaylist = null;
    service.originalPlaylistItems = null;
    service.queuedPlaylistPending = false;
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

  it('restores refreshed items when shuffle is turned off after a refresh', () => {
    const oldPlaylist = playlist('old', ['A', 'B', 'C'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: oldPlaylist,
        index: 1,
        shuffle: false,
      },
      false
    );

    expect(service.setShuffle({ enabled: true })).toEqual({ ok: true });

    const refreshedItems = ['A', 'B', 'D'].map(item);
    expect(service.refreshPlaylist(refreshedItems)).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.shuffle).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
      'A',
      'B',
      'D',
    ]);

    expect(service.setShuffle({ enabled: false })).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.shuffle).toBe(false);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
      'A',
      'B',
      'D',
    ]);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('keeps shuffled order when refresh matches the original playlist', () => {
    const oldPlaylist = playlist('old', ['A', 'B', 'C'].map(item), defaults('red'));
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: oldPlaylist,
        index: 1,
        shuffle: false,
      },
      false
    );

    expect(service.setShuffle({ enabled: true })).toEqual({ ok: true });
    const shuffledItems =
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id) ?? [];

    expect(service.refreshPlaylist(['A', 'B', 'C'].map(item))).toEqual({ ok: true });

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(canvasService.getCastInfo()?.shuffle).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual(
      shuffledItems
    );
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
