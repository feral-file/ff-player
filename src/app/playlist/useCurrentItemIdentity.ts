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
 * long as that showing — the viewer's session Fit/Fill in useArtworkSettings,
 * and the mount decision in useArtworkSource. Coarser than a preference
 * object (a same-slot re-merge, e.g. the device scaling record landing late,
 * must not reset the session) and finer than useCurrentItemIdentity (a new
 * cast may reuse an id for a different source), so the key carries the item
 * identity and the source.
 *
 * The slot index joins them only when identity and source together cannot
 * stand on their own: two slots of this playlist carrying the same id AND the
 * same source, which is the case the index was there to separate. That is
 * exactly `slotShowingUnchanged`'s test for one showing, and the two must
 * agree — the rebuild decides whether to keep a running deadline by that
 * function, so a key that called a pair ambiguous where it does not would
 * remount an artwork whose timer had just been preserved, cutting it off with
 * whatever was left of the interval. The same id under a different source
 * needs no index: `[identity, source]` already separates those two.
 *
 * So an unambiguous item keeps its key when a rebuild moves it — a series
 * group expanding earlier in the list shifts every later slot — and the same
 * artwork is not torn down and replayed for having changed position. That is
 * the reading `slotShowingUnchanged` already states ("an id-carrying item
 * moved by a rebuild is still the same showing"), and an ended artwork held
 * by repeat-off depends on the two agreeing: a key that moved with the index
 * would remount it and start it over. An id-less item is unaffected, because
 * `itemIdentityFor` makes its position part of its identity, which is the
 * same answer the resolver gives it.
 *
 * Encode the tuple without delimiters that can also occur inside an id or URL.
 */
export function useShowingKey(playlist: DP1Item[], currentIndex: number): string {
  return useMemo(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      return '';
    }
    const index = normalizePlaylistIndex(currentIndex, playlist.length);
    const identity = itemIdentityFor(playlist, index);
    const source = playlist[index]?.source ?? '';
    const ambiguous = playlist.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        itemIdentityFor(playlist, otherIndex) === identity &&
        other.source === source
    );
    return JSON.stringify(
      ambiguous ? [index, identity, source] : [identity, source]
    );
  }, [currentIndex, playlist]);
}
