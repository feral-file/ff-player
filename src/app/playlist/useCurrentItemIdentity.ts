import type { DP1Item } from '@/models/dp1.model';
import {
  itemIdentityFor,
  normalizePlaylistIndex,
  showingIdentityFor,
} from '@/utils/playlist';
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
 * long as that showing — the viewer's session Fit/Fill in useArtworkSettings,
 * and the mount decision in useArtworkSource. Coarser than a preference
 * object (a same-slot re-merge, e.g. the device scaling record landing late,
 * must not reset the session) and finer than useCurrentItemIdentity (a new
 * cast may reuse an id for a different source).
 *
 * It is `showingIdentityFor` verbatim, and has to be: the rebuild that
 * changes the series-playback override decides by that same function whether
 * the slot on screen keeps its running deadline and its repeat-off hold, so a
 * key computed any other way would remount an artwork whose timer had just
 * been preserved — cutting it off with whatever was left of the interval — or
 * replay an ended one the resolver had deliberately held. One definition,
 * read by both sides, is the only arrangement in which they cannot drift.
 *
 * What that buys here: an artwork keeps its key when a rebuild moves it (a
 * series group expanding earlier in the list shifts every later slot), while
 * two slots carrying the same id and the same source are still told apart by
 * which occurrence of that pair they are.
 */
export function useShowingKey(playlist: DP1Item[], currentIndex: number): string {
  return useMemo(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      return '';
    }
    return showingIdentityFor(
      playlist,
      normalizePlaylistIndex(currentIndex, playlist.length)
    );
  }, [currentIndex, playlist]);
}
