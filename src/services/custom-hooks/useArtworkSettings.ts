'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canvasService } from '../CanvasService';
import { DP1DisplayPreference } from '@/models/dp1.model';
import { applyDeviceFraming, type DeviceFraming } from '@/utils/deviceFraming';

export type TokenDisplaySettingWithChanged = DP1DisplayPreference & {
  changed?: boolean;
};

/**
 * The display settings ArtworkPlayer renders the current item with: the
 * item's merged DP-1 preference, plus any viewer adjustment made to THIS
 * showing from the Control Center.
 *
 * The base is the merged DP-1 preference (baked-in → legacy device
 * fallback → playlist → manifests → item). Current-showing adjustments sit
 * above it and reset when sessionKey changes. A saved explicit device framing
 * choice is applied last, unless the authored preference forbids user overrides.
 * Follow artwork removes this final override; legacy scaling stays only a
 * fallback for documents with no authored scaling.
 *
 * The session key tracks the slot/work/source, not the preference object: a
 * late manifest or hydrated device record must not erase the current showing's
 * matting. Persistent framing comes from AppContext; this hook only listens
 * for ephemeral adjustments and never changes the signed document.
 */
export function useArtworkSettings(
  displayPreferences: DP1DisplayPreference,
  sessionKey = '',
  framing: DeviceFraming = 'artwork'
) {
  const [sessionAdjustment, setSessionAdjustment] =
    useState<{ key: string; settings: Partial<DP1DisplayPreference> } | null>(null);

  // The listener below is registered once and reads the selected showing
  // from this layout-updated ref. Re-registering per sessionKey left a gap
  // before the passive effects in which the old listener filed a keyless
  // legacy write under the old key, where the new render and reset lost it.
  const sessionKeyRef = useRef(sessionKey);
  useLayoutEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  // A new showing replaces the whole stack, including any adjustment made
  // to the previous one. An adjustment already filed under the new key is
  // the new showing's own and survives.
  useEffect(() => {
    setSessionAdjustment(prev => (prev?.key === sessionKey ? prev : null));
  }, [sessionKey]);

  // Session-scoped viewer adjustments from the mobile app. Persistent
  // writes are handled by useDeviceSettings and arrive through AppContext.
  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DP1DisplayPreference
    ) => {
      if (isSaveToDevice) {
        return;
      }

      console.log('[useArtworkSettings] Updating artist settings', newSettings);
      const key = sessionKeyRef.current;
      setSessionAdjustment(prev => ({
        key,
        settings: {
          ...(prev?.key === key ? prev.settings : undefined),
          ...newSettings,
        },
      }));
    };
    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  const displaySettings = useMemo(():
    | TokenDisplaySettingWithChanged
    | undefined => {
    // Ignore the old slot's adjustment during the first render of a new
    // showing, before the passive reset above has run.
    if (sessionAdjustment?.key !== sessionKey) {
      return applyDeviceFraming(displayPreferences, framing);
    }
    return {
      ...applyDeviceFraming({ ...displayPreferences, ...sessionAdjustment.settings }, framing),
      changed: true,
    };
  }, [displayPreferences, sessionAdjustment, sessionKey, framing]);

  return {
    displaySettings,
  };
}
