import { LoopMode } from '@/models/cast_info.model';
import type { DP1Item } from '@/models/dp1.model';

/**
 * Normalize a playlist index to the range of 0 to playlistLength - 1.
 * @param index - The index to normalize.
 * @param playlistLength - The length of the playlist.
 * @returns The normalized index.
 */
export function normalizePlaylistIndex(
  index: number,
  playlistLength: number
): number {
  if (playlistLength <= 0) {
    return -1;
  }

  const normalizedIndex = index % playlistLength;
  return normalizedIndex < 0
    ? normalizedIndex + playlistLength
    : normalizedIndex;
}

/**
 * After replacing playlist items (refresh / reorder), map the previously active
 * index onto the new list using item ids so getStatus stays aligned with the
 * artwork still playing before the UI applies the queued list.
 */
export function resolveItemIndexInNewItems(
  newItems: DP1Item[],
  previousItems: DP1Item[] | undefined,
  previousIndex: number | undefined
): number {
  if (newItems.length <= 0) {
    return -1;
  }
  if (!previousItems?.length) {
    return normalizePlaylistIndex(previousIndex ?? 0, newItems.length);
  }

  const curIdx = normalizePlaylistIndex(
    previousIndex ?? 0,
    previousItems.length
  );
  const id = previousItems[curIdx]?.id;
  if (!id) {
    return normalizePlaylistIndex(curIdx, newItems.length);
  }

  const found = newItems.findIndex(item => item.id === id);
  if (found >= 0) {
    return found;
  }

  return normalizePlaylistIndex(curIdx, newItems.length);
}

interface ResolveQueuedPlaylistNextIndexOptions {
  targetIndex?: number;
  queuedPlaylist: DP1Item[];
  previousItems?: DP1Item[];
  hasDeferredRefresh?: boolean;
  currentItemId?: string;
  keepCurrent?: boolean;
}

/**
 * Resolve the index to use when a queued playlist is finally applied.
 *
 * If a remote command already chose a target index, keep that intent and remap it
 * through item ids when the queued list came from a deferred refresh. Otherwise
 * derive the next position from the current item and optionally keep that item
 * selected (LoopMode.one) instead of advancing.
 */
export function resolveQueuedPlaylistNextIndex({
  targetIndex,
  queuedPlaylist,
  previousItems,
  hasDeferredRefresh = false,
  currentItemId,
  keepCurrent = false,
}: ResolveQueuedPlaylistNextIndexOptions): number {
  if (targetIndex !== undefined && hasDeferredRefresh) {
    return resolveItemIndexInNewItems(
      queuedPlaylist,
      previousItems,
      targetIndex
    );
  }

  if (targetIndex !== undefined) {
    return normalizePlaylistIndex(targetIndex, queuedPlaylist.length);
  }

  const currentPosInQueued = currentItemId
    ? queuedPlaylist.findIndex(item => item.id === currentItemId)
    : -1;

  if (currentPosInQueued >= 0) {
    return keepCurrent
      ? currentPosInQueued
      : normalizePlaylistIndex(currentPosInQueued + 1, queuedPlaylist.length);
  }

  return 0;
}

interface ResolveSequentialPlaylistAdvanceOptions {
  currentIndex: number;
  playlistLength: number;
  loopMode: LoopMode;
}

/**
 * Resolve the next index for timer-driven sequential playback.
 *
 * `none` holds on the final artwork instead of wrapping, `playlist` wraps
 * through the full list, and `one` keeps the current artwork selected.
 */
export function resolveSequentialPlaylistAdvance({
  currentIndex,
  playlistLength,
  loopMode,
}: ResolveSequentialPlaylistAdvanceOptions): number | null {
  if (playlistLength <= 0) {
    return null;
  }

  const normalizedIndex = normalizePlaylistIndex(currentIndex, playlistLength);
  if (normalizedIndex < 0) {
    return null;
  }

  if (loopMode === LoopMode.one) {
    return normalizedIndex;
  }

  if (loopMode === LoopMode.none && normalizedIndex === playlistLength - 1) {
    return null;
  }

  return normalizePlaylistIndex(normalizedIndex + 1, playlistLength);
}
