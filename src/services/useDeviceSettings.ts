import { useEffect, useState } from 'react';
import CanvasService from './CanvasService';
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
        setDisplaySettings(prev => ({
          ...prev,
          ...newSettings,
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
    if (displaySettings) {
      DeviceManager.setDeviceDisplaySettings(displaySettings);
    }
  }, [displaySettings]);

  return { displaySettings, setDisplaySettings };
}
