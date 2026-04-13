'use client';

import { useEffect, useState } from 'react';
import { canvasService } from '../CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { DisplaySettings } from '@/models/display_settings.model';

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
