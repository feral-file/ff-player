'use client';

import { useEffect, useMemo, useState } from 'react';
import { canvasService } from '../CanvasService';
import { useAppContext } from '@/context/AppContext';
import { DP1DisplayPreference } from '@/models/dp1.model';

export type TokenDisplaySettingWithChanged = DP1DisplayPreference & {
  changed?: boolean;
};

export function useArtworkSettings(displayPreferences: DP1DisplayPreference) {
  const { context } = useAppContext();
  const [tokenDisplaySettings, setTokenDisplaySettings] = useState<
    TokenDisplaySettingWithChanged | null | undefined
  >(displayPreferences);

  // Update tokenDisplaySettings when displayPreferences prop changes
  useEffect(() => {
    setTokenDisplaySettings(displayPreferences);
  }, [displayPreferences]);

  // Listen to token display settings changes by user control from mobile app
  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DP1DisplayPreference
    ) => {
      if (isSaveToDevice) return;

      console.log('[useArtworkSettings] Updating artist settings', newSettings);
      setTokenDisplaySettings(prev => ({
        ...prev,
        ...newSettings,
        changed: true,
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
    return {
      ...tokenDisplaySettings,
      ...(context.displaySettings
        ? Object.fromEntries(Object.entries(context.displaySettings))
        : {}),
    };
  }, [tokenDisplaySettings, context.displaySettings]);

  return {
    displaySettings,
  };
}
