'use client';

import { useEffect, useMemo, useState } from 'react';
import { canvasService } from '../CanvasService';
import { DP1DisplayPreference } from '@/models/dp1.model';

export type TokenDisplaySettingWithChanged = DP1DisplayPreference & {
  changed?: boolean;
};

/**
 * The display settings ArtworkPlayer renders the current item with: the
 * item's merged DP-1 preference, plus any viewer adjustment made to THIS
 * showing from the Control Center.
 *
 * Two layers, in order. The base is [displayPreferences], the merged DP-1
 * preference for the item (mergeItemDisplayPreference: baked-in → device
 * machine default → playlist defaults → manifests → item). On top sit
 * `updateDisplaySettings` writes with `isSaved: false` — the viewer's live
 * Fit/Fill or matting choice for the artwork on screen.
 *
 * The adjustment is scoped to [itemIdentity], not to the preference object:
 * the same showing can receive a fresh merged preference without changing
 * work (the device scaling record landing after the slot was entered, or a
 * late ref manifest), and a Fit chosen for this work must survive that. It
 * is forgotten when the identity changes, which is what makes it
 * session-scoped.
 *
 * The device's PERSISTED settings (`isSaved: true`, AppContext
 * `displaySettings`) are deliberately not read here any more. They used to
 * be spread over the finished merge, so a device that had ever stored
 * `scaling: fit` rendered every playlist at `fit` regardless of what its
 * documents said — and once the app retired the Canvas row that wrote the
 * value, nothing could change it. The persisted record now enters the merge
 * as its lowest DP-1 layer (usePlaylistItemDisplayPreference), so it still
 * fills the gap when a playlist is silent, but never overrides a curator.
 */
export function useArtworkSettings(
  displayPreferences: DP1DisplayPreference,
  itemIdentity = ''
) {
  const [sessionAdjustment, setSessionAdjustment] =
    useState<Partial<DP1DisplayPreference> | null>(null);

  // A new work replaces the whole stack, including any adjustment made to
  // the previous showing.
  useEffect(() => {
    setSessionAdjustment(null);
  }, [itemIdentity]);

  // Session-scoped viewer adjustments from the mobile app. Persistent
  // writes (`isSaved: true`) are the device layer of the merge, not an
  // override of it, so they are ignored here.
  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DP1DisplayPreference
    ) => {
      if (isSaveToDevice) {
        return;
      }

      console.log('[useArtworkSettings] Updating artist settings', newSettings);
      setSessionAdjustment(prev => ({ ...prev, ...newSettings }));
    };
    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  const displaySettings = useMemo(():
    | TokenDisplaySettingWithChanged
    | undefined => {
    if (!sessionAdjustment) {
      return displayPreferences;
    }
    return { ...displayPreferences, ...sessionAdjustment, changed: true };
  }, [displayPreferences, sessionAdjustment]);

  return {
    displaySettings,
  };
}
