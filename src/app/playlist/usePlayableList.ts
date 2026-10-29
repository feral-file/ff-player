import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';

/**
 * Owns the one operation that drops every trace of a playable list: the item
 * state, the selected index, the playlist defaults, the resolved display
 * preference, and the published preview.
 *
 * It exists as a unit because those five have to move together — leaving any
 * one of them behind is how a cleared wall keeps a stale index, re-resolves a
 * preference for a work that is gone, or lets the media gate ask about an item
 * the route no longer has. Latches that mean different things at different call
 * sites (hold-after-final-slot, loop mode, the slot timer) stay with the caller.
 */
export function usePlayableList(deps: {
  currentItemRef: MutableRefObject<DP1Item | undefined>;
  setPlaylist: Dispatch<SetStateAction<DP1Item[]>>;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
  setPlaylistDefaultsSettings: Dispatch<SetStateAction<DP1Defaults | null>>;
  resetItemDisplayPreference: () => void;
  clearPreview: () => void;
}): () => void {
  const { currentItemRef, setPlaylist, setCurrentIndex,
    setPlaylistDefaultsSettings, resetItemDisplayPreference, clearPreview } = deps;
  return useCallback(() => {
    currentItemRef.current = undefined;
    setPlaylist([]);
    setCurrentIndex(-1);
    setPlaylistDefaultsSettings(null);
    resetItemDisplayPreference();
    clearPreview();
  }, [currentItemRef, setPlaylist, setCurrentIndex, setPlaylistDefaultsSettings,
    resetItemDisplayPreference, clearPreview]);
}
