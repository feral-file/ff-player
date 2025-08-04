'use client';

import { useEffect, useMemo, useState } from 'react';
import CanvasService from '../CanvasService';
import { useAppContext } from '@/context/AppContext';
import {
  defaultDP1DisplayPreference,
  DP1DisplayPreference,
} from '@/models/dp1.model';

export type TokenDisplaySettingWithChanged = DP1DisplayPreference & {
  changed?: boolean;
};

export function useArtworkSettings(displayPreferences: DP1DisplayPreference) {
  const { context } = useAppContext();
  const [tokenDisplaySettings, setTokenDisplaySettings] = useState<
    TokenDisplaySettingWithChanged | null | undefined
  >(displayPreferences);

  // Listen to token display settings changes
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
    CanvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      CanvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  const displaySettings = useMemo(():
    | TokenDisplaySettingWithChanged
    | undefined => {
    // // ignore first render
    // if (tokenDisplaySettings === undefined) return undefined;
    // console.log('[useArtworkSettings] displaySettings', tokenDisplaySettings);
    // console.log(
    //   '[useArtworkSettings] context.displaySettings',
    //   context.displaySettings
    // );
    // if (!tokenDisplaySettings) {
    //   return context.displaySettings ?? DisplaySettings.defaultSettings();
    // }
    // if (tokenDisplaySettings.changed) {
    //   return tokenDisplaySettings;
    // }
    // if (tokenDisplaySettings.userOverrides) {
    //   return {
    //     ...tokenDisplaySettings,
    //     ...context.displaySettings,
    //   };
    // }
    // return tokenDisplaySettings;

    return {
      ...tokenDisplaySettings,
      ...context.displaySettings,
    };
  }, [tokenDisplaySettings, context.displaySettings]);

  return {
    displaySettings,
  };
}
