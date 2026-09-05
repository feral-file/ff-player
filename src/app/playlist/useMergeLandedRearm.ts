import type { DP1DisplayPreference, DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { MutableRefObject, useEffect } from 'react';

/**
 * Once the async display-preference merge (incl. the ref-manifest layer)
 * lands for the current slot, re-arm its timer: the initial arm ran without
 * the device override (merge unknown), and only the merged preference may
 * grant it. The re-arm passes `preserveElapsed`, and scheduleCurrentItemTimer
 * decides whether the pacing actually changed: an unchanged effective
 * duration keeps the armed deadline (a re-merge that touched only display
 * fields, such as the device scaling record landing late), the item's own
 * duration keeps time since slot entry, anything else restarts from zero.
 *
 * Without a device default the merge cannot change the timer (only the item
 * duration governs), so the re-arm is skipped and the entry-armed baseline
 * keeps its elapsed time — ref items must not restart at 10s just because
 * their manifest landed. Extracted from PlaylistClient so the route file
 * stays within its line budget.
 */
export function useMergeLandedRearm(options: {
  preference: DP1DisplayPreference | null;
  currentIndexRef: MutableRefObject<number>;
  playlistRef: MutableRefObject<DP1Item[]>;
  scheduleCurrentItemTimer: (
    index: number,
    snapshot: DP1Item[],
    preserveElapsed?: boolean
  ) => void;
}): void {
  const { preference, currentIndexRef, playlistRef, scheduleCurrentItemTimer } =
    options;
  useEffect(() => {
    if (!preference) {
      return;
    }
    if (currentIndexRef.current < 0 || playlistRef.current.length === 0) {
      return;
    }
    if (DeviceManager.getCachedDefaultItemDurationSeconds() === null) {
      return;
    }
    scheduleCurrentItemTimer(currentIndexRef.current, playlistRef.current, true);
  }, [preference, currentIndexRef, playlistRef, scheduleCurrentItemTimer]);
}
