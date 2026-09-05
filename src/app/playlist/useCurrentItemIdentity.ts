import type { DP1Item } from '@/models/dp1.model';
import { itemIdentityFor, normalizePlaylistIndex } from '@/utils/playlist';
import { useMemo } from 'react';

/**
 * Stable identity of the item at the active slot: the item id when it has
 * one, else an index-plus-source key. Recomputed only when the playlist or
 * the current index changes. Passed to ArtworkPlayer so the end-of-stream
 * gate can reject events from a previous adjacent item that happens to share
 * the same source URL, and so useArtworkSettings can scope a viewer's
 * session adjustment to one showing. Its own file so the route stays within
 * its line budget.
 */
export function useCurrentItemIdentity(
  playlist: DP1Item[],
  currentIndex: number
): string {
  return useMemo(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      return '';
    }
    return itemIdentityFor(
      playlist,
      normalizePlaylistIndex(currentIndex, playlist.length)
    );
  }, [currentIndex, playlist]);
}
