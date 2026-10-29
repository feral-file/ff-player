import { NO_DURATION_VALUE } from '@/constants';
import { DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import {
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
  resolveRepeatOffHoldAfterRebuild,
  type RepeatOffHoldAfterRebuild,
} from '@/utils/playlist';
import {
  narrowSeriesPlaylist,
  type NarrowedSeriesPlaylist,
} from '@/utils/seriesPlayback';

/**
 * The playable view of a raw cast playlist: what the viewer actually sees
 * once this device's series-playback override is applied.
 *
 * Every route-layer reader of `castInfo.playlist.items` goes through here
 * instead of reading the array directly, so a `seriesRegistry` item or an
 * already-expanded series group plays per its resolved mode. The raw list is
 * never narrowed in place — `CanvasService` keeps it as cast — so toggling
 * the override back and forth stays reversible without a re-cast.
 */
export function narrowForDevice(rawItems: DP1Item[]): NarrowedSeriesPlaylist {
  return narrowSeriesPlaylist(
    rawItems,
    DeviceManager.getCachedSeriesPlayback()
  );
}

/**
 * A local (narrowed) index translated back to the raw position to publish as
 * `castInfo.index`.
 *
 * Everything that reads `castInfo.index` — `moveToArtwork`, `getStatus`,
 * `triggerArtworkRefresh` — expects RAW space, which `CanvasService` never
 * narrows, so publishing a local index unchanged would desync the two the
 * moment a narrowed series group sits anywhere but the very start, and would
 * corrupt the next command's own narrowing (which re-maps `castInfo.index` as
 * raw). `rawIndexOf` resolves it by construction rather than by id: two raw
 * items can legitimately share an id (the same artwork twice in one
 * playlist), which an id lookup cannot tell apart but this never confuses.
 */
export function rawIndexForLocal(localIndex: number): number {
  const rawItems = canvasService.getCastInfo()?.playlist?.items;
  if (!rawItems?.length) {
    return localIndex;
  }
  return narrowForDevice(rawItems).rawIndexOf(localIndex);
}

/** A queued playlist narrowed for this device, with the slot to select. */
export interface QueuedSeriesSelection {
  items: DP1Item[];
  /** The position in `items` — the space the route's own state lives in. */
  localIndex: number;
  /** The same slot in raw space, for `castInfo.index`. */
  rawIndex: number;
}

/**
 * Where a queued refresh/shuffle should land, resolved in the right space.
 *
 * Which space the next index comes from depends on where it came from, and
 * the two cannot share one call:
 *
 * A `targetIndex` is a RAW position — a controller's `castInfo.index`,
 * remapped onto the new raw list when the refresh was deferred. It is
 * resolved against the raw `queuedPlaylist` and carried across with
 * `mapIndex`, the pattern every other cast-command path uses.
 *
 * A natural advance (no `targetIndex`) has to step through the list the
 * viewer actually sees. Resolved in raw space, the successor of the item on
 * screen is the next EDITION of its own collapsed series group, which
 * `mapIndex` sends straight back to the slot already showing — so each
 * queued refresh would replay the same item and playback would never leave
 * the group. Resolving against the narrowed list steps to the group's
 * successor instead. `keepCurrent` belongs in the same space for the same
 * reason: the current item is an item of the NARROWED list, so that is where
 * its id is looked up.
 */
export function resolveQueuedSeriesSelection(params: {
  targetIndex?: number;
  queuedPlaylist: DP1Item[];
  previousItems?: DP1Item[];
  hasDeferredRefresh: boolean;
  currentItemId?: string;
  keepCurrent: boolean;
}): QueuedSeriesSelection {
  const {
    targetIndex,
    queuedPlaylist,
    previousItems,
    hasDeferredRefresh,
    currentItemId,
    keepCurrent,
  } = params;
  const { items, mapIndex, rawIndexOf } = narrowForDevice(queuedPlaylist);
  const resolved =
    targetIndex === undefined
      ? resolveQueuedPlaylistNextIndex({
          queuedPlaylist: items,
          currentItemId,
          keepCurrent,
        })
      : mapIndex(
          resolveQueuedPlaylistNextIndex({
            targetIndex,
            queuedPlaylist,
            previousItems,
            hasDeferredRefresh,
          })
        );
  const localIndex = normalizePlaylistIndex(resolved, items.length);
  return { items, localIndex, rawIndex: rawIndexOf(localIndex) };
}

/** What a series-override change rebuilds the playable list into. */
export interface SeriesOverrideRebuild {
  nextPlaylist: DP1Item[];
  nextIndex: number;
  holdOutcome: RepeatOffHoldAfterRebuild;
}

/**
 * The playable list a changed series-playback override rebuilds to, and what
 * that rebuild means for a repeat-off hold.
 *
 * Unlike a duration change, the override can change WHICH items play (`First`
 * collapses an expanded series to one edition; `Full` restores every edition
 * it narrowed away), so the list itself is rebuilt — always from the raw cast
 * items, never from the already-narrowed playable list. The slot carrying the
 * item on screen is tracked by id, since a First<->Full flip changes the
 * array's length and positions.
 *
 * A repeat-off hold claims "the ended item on screen is the last thing this
 * playlist had to play". A rebuild can leave that claim standing, falsify it,
 * or make it meaningless; only `resolveRepeatOffHoldAfterRebuild` knows
 * which, and getting it wrong strands the ended slot with no timer armed and
 * no command left that can restart it.
 */
export function resolveSeriesOverrideRebuild(params: {
  rawItems: DP1Item[];
  currentItemId?: string;
  previousPlaylist: DP1Item[];
  previousIndex: number;
  holdAfterFinalSlot: boolean;
}): SeriesOverrideRebuild {
  const {
    rawItems,
    currentItemId,
    previousPlaylist,
    previousIndex,
    holdAfterFinalSlot,
  } = params;
  const { items, mapIndex } = narrowForDevice(rawItems);
  const rawCurrentIndex =
    currentItemId === undefined
      ? 0
      : Math.max(
          0,
          rawItems.findIndex(raw => raw.id === currentItemId)
        );
  const nextIndex = normalizePlaylistIndex(
    mapIndex(rawCurrentIndex),
    items.length
  );
  const nextPlaylist = items.map(item => ({
    ...item,
    duration: item.duration ?? NO_DURATION_VALUE,
  }));
  return {
    nextPlaylist,
    nextIndex,
    holdOutcome: resolveRepeatOffHoldAfterRebuild({
      holdAfterFinalSlot,
      previousPlaylist,
      previousIndex,
      nextPlaylist,
      nextIndex,
    }),
  };
}
