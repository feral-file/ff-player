'use client';

import { useEffect, useState } from 'react';
import { canvasService } from '../CanvasService';
import { deviceManager } from '@/utils/DeviceManager';
import { DeviceDisplaySettings } from '@/models/display_settings.model';

const useDeviceSettings = () => {
  const [displaySettings, setDisplaySettings] = useState<
    DeviceDisplaySettings | undefined
  >();

  useEffect(() => {
    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: DeviceDisplaySettings
    ) => {
      if (isSaveToDevice) {
        setDisplaySettings(prev => ({
          ...prev,
          ...newSettings,
        }));
      }
    };

    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (displaySettings) {
      deviceManager.setDeviceDisplaySettings(displaySettings);
    }
  }, [displaySettings]);

  return { displaySettings, setDisplaySettings };
};

export default useDeviceSettings;
