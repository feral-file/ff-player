import {
  defaultDP1DisplayPreference,
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import {
  mergeStillDescribesActiveSlot,
  normalizePlaylistIndex,
  SlotMergedDisplay,
} from '@/utils/playlist';
import {
  clearUnversionedRefManifestDisplayCache,
  resolveAndApplyItemDisplayPreference,
} from '@/utils/playlistDisplayPreference';
import { MutableRefObject, useCallback, useRef, useState } from 'react';

/**
 * Owns the active slot's display preference for the playlist route: the
 * rendered preference state, the slot-tagged merged-display cache the
 * duration gate reads, and the async resolution flow (sync layers
 * immediately, ref-manifest layer bounded with late-arrival re-apply).
 * Extracted from PlaylistClient so the route file stays within its line
 * budget and the merge lifecycle lives in one place.
 */
export function usePlaylistItemDisplayPreference(options: {
  playlistDefaults: DP1Defaults | null;
  currentItemRef: MutableRefObject<DP1Item | undefined>;
  currentIndexRef: MutableRefObject<number>;
  playlistRef: MutableRefObject<DP1Item[]>;
}): {
  preference: DP1DisplayPreference | null;
  mergedDisplayRef: MutableRefObject<SlotMergedDisplay | null>;
  resolveForSlot: (dp1Item: DP1Item, slotIndex: number) => Promise<void>;
  clearMergedDisplayForNewCast: () => void;
  clearMergedDisplay: () => void;
  reset: () => void;
} {
  const { playlistDefaults, currentItemRef, currentIndexRef, playlistRef } =
    options;

  const [preference, setPreference] = useState<DP1DisplayPreference | null>(
    null
  );
  // Bumped whenever the playlist is replaced. An async merge started under
  // an older generation must not apply even when the replacement keeps the
  // same slot index/id/ref — the new cast may carry different display gates.
  const generationRef = useRef(0);
  // Fully merged display preference (incl. async ref-manifest layer), tagged
  // with its slot so the timer's default-duration gate reads the same
  // preference rendering applies and never a stale merge from another slot.
  const mergedDisplayRef = useRef<SlotMergedDisplay | null>(null);

  const resolveForSlot = useCallback(
    async (dp1Item: DP1Item, slotIndex: number) => {
      const activeItemId = dp1Item.id;
      const activeRef = dp1Item.ref;
      const generation = generationRef.current;

      // Apply only if this merge still describes the slot on screen; a slot
      // change while the ref manifest loaded makes the result stale. The
      // index is part of the guard because same-id/ref slots may carry
      // different per-slot display fields.
      const apply = (merged: DP1DisplayPreference) => {
        if (generation !== generationRef.current) {
          return;
        }
        const activeIndex = normalizePlaylistIndex(
          currentIndexRef.current,
          playlistRef.current.length
        );
        const stillActive = mergeStillDescribesActiveSlot({
          activeIndex,
          activeItem: currentItemRef.current,
          slotIndex,
          itemId: activeItemId,
          ref: activeRef,
        });
        if (stillActive) {
          mergedDisplayRef.current = {
            index: slotIndex,
            itemId: activeItemId,
            ref: activeRef,
            display: merged,
          };
          setPreference(merged);
        }
      };

      await resolveAndApplyItemDisplayPreference(
        dp1Item,
        playlistDefaults,
        apply
      );
    },
    [playlistDefaults, currentIndexRef, currentItemRef, playlistRef]
  );

  // A fresh display replaces items and defaults wholesale; a cached merge
  // from the previous list may share id/ref with a new item yet carry
  // outdated gate fields, so it must not survive the swap. The same boundary
  // refreshes hash-less ref manifests, whose content may have changed
  // without a version identity to detect it by. The rendered preference is
  // kept until the new slot's merge lands so the artwork does not unmount.
  const clearMergedDisplay = useCallback(() => {
    generationRef.current++;
    mergedDisplayRef.current = null;
  }, []);

  const clearMergedDisplayForNewCast = useCallback(() => {
    clearMergedDisplay();
    clearUnversionedRefManifestDisplayCache();
  }, [clearMergedDisplay]);

  const reset = useCallback(() => {
    clearMergedDisplay();
    setPreference(null);
  }, [clearMergedDisplay]);

  return {
    preference,
    mergedDisplayRef,
    resolveForSlot,
    clearMergedDisplayForNewCast,
    clearMergedDisplay,
    reset,
  };
}

/** Re-exported for callers that only need the baked-in default preference. */
export { defaultDP1DisplayPreference };
