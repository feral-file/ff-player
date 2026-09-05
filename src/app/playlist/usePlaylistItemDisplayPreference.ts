import {
  defaultDP1DisplayPreference,
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import type { DisplaySettings } from '@/models/display_settings.model';
import {
  mergeStillDescribesActiveSlot,
  normalizePlaylistIndex,
  SlotMergedDisplay,
} from '@/utils/playlist';
import {
  clearUnversionedRefManifestDisplayCache,
  deviceDefaultDisplay,
  resolveAndApplyItemDisplayPreference,
} from '@/utils/playlistDisplayPreference';
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** The route's live-position refs, shared by the guard and the re-resolve. */
interface SlotRefs {
  currentItemRef: MutableRefObject<DP1Item | undefined>;
  currentIndexRef: MutableRefObject<number>;
  playlistRef: MutableRefObject<DP1Item[]>;
}

/** Everything the per-slot apply guard needs to decide and to store. */
interface SlotApplyContext extends SlotRefs {
  /** Generation the merge started under; a bump makes it stale. */
  generation: number;
  generationRef: MutableRefObject<number>;
  slotIndex: number;
  dp1Item: DP1Item;
  mergedDisplayRef: MutableRefObject<SlotMergedDisplay | null>;
  setPreference: (merged: DP1DisplayPreference) => void;
}

/**
 * Builds the apply callback for one slot's merge. A merge applies only if it
 * still describes the slot on screen: a playlist replacement (generation
 * bump) or a slot change while the ref manifest loaded makes the result
 * stale. The index is part of the guard because same-id/ref slots may carry
 * different per-slot display fields. Module-level so the hook body stays
 * within its function line budget.
 */
function makeSlotApply(
  ctx: SlotApplyContext
): (merged: DP1DisplayPreference) => void {
  return merged => {
    if (ctx.generation !== ctx.generationRef.current) {
      return;
    }
    const activeIndex = normalizePlaylistIndex(
      ctx.currentIndexRef.current,
      ctx.playlistRef.current.length
    );
    const stillActive = mergeStillDescribesActiveSlot({
      activeIndex,
      activeItem: ctx.currentItemRef.current,
      slotIndex: ctx.slotIndex,
      itemId: ctx.dp1Item.id,
      ref: ctx.dp1Item.ref,
    });
    if (stillActive) {
      ctx.mergedDisplayRef.current = {
        index: ctx.slotIndex,
        itemId: ctx.dp1Item.id,
        ref: ctx.dp1Item.ref,
        display: merged,
      };
      ctx.setPreference(merged);
    }
  };
}

/**
 * Re-resolves the slot on screen when the device's persisted scaling changes
 * after that slot was entered (a late IndexedDB read at boot, or a
 * persistent write from an older app that still has the Canvas row).
 *
 * A dedicated effect rather than a dependency of `resolveForSlot`: a new
 * callback identity would re-run PlaylistClient's slot-entry effect, which
 * re-arms the slot timer from zero. This path applies the new merge through
 * `setPreference`, and the merge-landed re-arm preserves elapsed time.
 * Nothing runs on mount — the slot-entry effect owns the first resolve.
 */
function useReResolveOnDeviceScaling(
  deviceScaling: unknown,
  refs: SlotRefs,
  resolveForSlot: (dp1Item: DP1Item, slotIndex: number) => Promise<void>
): void {
  const appliedScaling = useRef(deviceScaling);
  useEffect(() => {
    if (appliedScaling.current === deviceScaling) {
      return;
    }
    appliedScaling.current = deviceScaling;
    const dp1Item = refs.currentItemRef.current;
    if (!dp1Item) {
      return;
    }
    const slotIndex = normalizePlaylistIndex(
      refs.currentIndexRef.current,
      refs.playlistRef.current.length
    );
    void resolveForSlot(dp1Item, slotIndex);
  }, [deviceScaling, refs, resolveForSlot]);
}

/**
 * Owns the active slot's display preference for the playlist route: the
 * rendered preference state, the slot-tagged merged-display cache the
 * duration gate reads, and the async resolution flow (sync layers
 * immediately, ref-manifest layer bounded with late-arrival re-apply).
 * Extracted from PlaylistClient so the route file stays within its line
 * budget and the merge lifecycle lives in one place.
 *
 * [deviceDisplaySettings] is the device's persisted record (AppContext).
 * Only its `scaling` reaches the merge, as the machine-default layer beneath
 * every DP-1 document — see mergeItemDisplayPreference for the ordering.
 */
export function usePlaylistItemDisplayPreference(options: {
  playlistDefaults: DP1Defaults | null;
  deviceDisplaySettings: DisplaySettings | null;
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
  const {
    playlistDefaults,
    deviceDisplaySettings,
    currentItemRef,
    currentIndexRef,
    playlistRef,
  } = options;

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

  // Read through a ref so a device-scaling change never changes this
  // callback's identity (see useReResolveOnDeviceScaling). Keyed on the
  // scaling VALUE: the persisted record also changes identity on tombstone
  // writes, which the artwork merge does not read.
  const deviceScaling = deviceDisplaySettings?.scaling;
  const deviceDefaultsRef = useRef(deviceDefaultDisplay(deviceScaling));
  deviceDefaultsRef.current = deviceDefaultDisplay(deviceScaling);
  const slotRefs = useMemo(
    () => ({ currentItemRef, currentIndexRef, playlistRef }),
    [currentItemRef, currentIndexRef, playlistRef]
  );

  const resolveForSlot = useCallback(
    async (dp1Item: DP1Item, slotIndex: number) => {
      const apply = makeSlotApply({
        ...slotRefs,
        generation: generationRef.current,
        generationRef,
        slotIndex,
        dp1Item,
        mergedDisplayRef,
        setPreference,
      });
      await resolveAndApplyItemDisplayPreference(
        dp1Item,
        playlistDefaults,
        apply,
        deviceDefaultsRef.current
      );
    },
    [playlistDefaults, slotRefs]
  );
  useReResolveOnDeviceScaling(deviceScaling, slotRefs, resolveForSlot);

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
