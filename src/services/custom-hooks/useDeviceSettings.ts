'use client';

import { useCallback, useEffect, useState } from 'react';
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
  // Partial class instances can contain explicit undefined fields. They must
  // not erase saved defaults that the command did not actually change.
  const definedSettings = Object.fromEntries(
    Object.entries(nextSettings).filter(([, value]) => value !== undefined)
  );

  return Object.assign(
    Object.create(prototype) as DisplaySettings,
    previousSettings ?? {},
    definedSettings
  );
}

/**
 * Mirrors display-setting updates from the canvas service into local state and
 * persisted device storage so restart recovery keeps the latest values.
 */
export function useDeviceSettings() {
  const [displaySettings, setDisplaySettings] =
    useState<DisplaySettings | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Startup reads can finish after a saved command. The command's partial
  // values win, while untouched stored defaults survive. Do not persist the
  // partial pre-hydration state: that would erase those untouched defaults.
  const initializeDisplaySettings = useCallback(async () => {
    try {
      const stored = await DeviceManager.getDeviceDisplaySettings();
      setDisplaySettings(current =>
        current ? mergeDisplaySettings(stored, current) : stored
      );
    } finally {
      // A failed settings read must not block later saves or cast recovery.
      setHydrated(true);
    }
  }, []);

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
    if (hydrated && displaySettings) {
      void DeviceManager.setDeviceDisplaySettings(displaySettings);
    }
  }, [displaySettings, hydrated]);

  return { displaySettings, initializeDisplaySettings };
}
