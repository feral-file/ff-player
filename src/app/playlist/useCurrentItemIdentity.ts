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

/**
 * Key of one SHOWING at the active slot, for state that must live exactly as
 * long as that showing — the viewer's session Fit/Fill in useArtworkSettings.
 * Coarser than a preference object (a same-slot re-merge, e.g. the device
 * scaling record landing late, must not reset the session) and finer than
 * useCurrentItemIdentity (adjacent slots may share an id while carrying
 * different display preferences, and a new cast may reuse an id for a
 * different source): normalized slot index, item identity, and source.
 */
export function useShowingKey(playlist: DP1Item[], currentIndex: number): string {
  return useMemo(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      return '';
    }
    const index = normalizePlaylistIndex(currentIndex, playlist.length);
    const source = playlist[index]?.source ?? '';
    return `${String(index)}|${itemIdentityFor(playlist, index)}|${source}`;
  }, [currentIndex, playlist]);
}
