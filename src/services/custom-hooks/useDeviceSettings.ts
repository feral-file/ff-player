'use client';

import { useEffect, useState } from 'react';
import { canvasService } from '../CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { DisplaySettings } from '@/models/display_settings.model';

export function useDeviceSettings() {
  const [displaySettings, setDisplaySettings] =
    useState<DisplaySettings | null>(null);

  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DisplaySettings
    ) => {
      if (isSaveToDevice) {
        setDisplaySettings(prev => {
          // Preserve the DisplaySettings instance so future amendments keep the
          // class behavior and defaults instead of silently degrading to a
          // plain object merge.
          const mergedSettings = new DisplaySettings(
            prev?.scaling ?? newSettings.scaling
          );

          Object.assign(mergedSettings, prev, newSettings);

          return mergedSettings;
        });
      }
    };

    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (displaySettings) {
      void DeviceManager.setDeviceDisplaySettings(displaySettings);
    }
  }, [displaySettings]);

  return { displaySettings, setDisplaySettings };
}
