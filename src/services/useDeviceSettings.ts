import { useEffect, useRef, useState } from 'react';
import CanvasService from './CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { DisplaySettings } from '@/models/display_settings.model';

type DisplaySettingWithChanged = DisplaySettings & {
  scalingChanged?: boolean;
};

export function useDeviceSettings() {
  const [displaySettings, setDisplaySettings] =
    useState<DisplaySettingWithChanged | null>(null);

  const isFirstRender = useRef(true);

  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DisplaySettings
    ) => {
      if (isSaveToDevice) {
        setDisplaySettings(prev => ({
          ...prev,
          ...newSettings,
          scalingChanged: prev?.scaling !== newSettings.scaling,
        }));
      }
    };

    const canvasService = CanvasService.getInstance();
    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  useEffect(() => {
    console.log('[useDeviceSettings] displaySettings', displaySettings);
    console.log('[useDeviceSettings] isFirstRender', isFirstRender.current);

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (displaySettings) {
      DeviceManager.setDeviceDisplaySettings(displaySettings);
    }
  }, [displaySettings]);

  return { displaySettings, setDisplaySettings };
}
