'use client';

import { useEffect, useState } from 'react';
import { canvasService } from '../CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { DisplaySettings } from '@/models/display_settings.model';

/**
 * Merges incoming display settings into the last saved instance without
 * dropping the `DisplaySettings` prototype used by downstream persistence.
 */
function mergeDisplaySettings(
  previousSettings: DisplaySettings | null,
  nextSettings: DisplaySettings
): DisplaySettings {
  const prototype = Object.getPrototypeOf(nextSettings) as object | null;

  return Object.assign(
    Object.create(prototype) as DisplaySettings,
    previousSettings ?? {},
    nextSettings
  );
}

/**
 * Mirrors display-setting updates from the canvas service into local state and
 * persisted device storage so restart recovery keeps the latest values.
 */
export function useDeviceSettings() {
  const [displaySettings, setDisplaySettings] =
    useState<DisplaySettings | null>(null);

  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DisplaySettings
    ) => {
      if (isSaveToDevice) {
        setDisplaySettings(previousSettings =>
          mergeDisplaySettings(previousSettings, newSettings)
        );
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
