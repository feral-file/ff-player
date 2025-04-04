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
  const displaySettingsRef = useRef<DisplaySettingWithChanged | null>(null);

  useEffect(() => {
    const handleDisplaySettingsChanged = (
      isSaveToDevice: boolean,
      displaySettings: DisplaySettings
    ) => {
      console.log(
        '[useDeviceSettings] handleDisplaySettingsChanged',
        JSON.stringify(displaySettings)
      );
      if (isSaveToDevice) {
        setDisplaySettings({
          ...displaySettingsRef.current,
          ...displaySettings,
          scalingChanged: !!displaySettings.scaling,
        });
      }
    };

    const canvasService = CanvasService.getInstance();
    canvasService.addDisplaySettingsChangedListener(
      handleDisplaySettingsChanged
    );

    return () => {
      canvasService.removeDisplaySettingsChangedListener(
        handleDisplaySettingsChanged
      );
    };
  }, []);

  useEffect(() => {
    displaySettingsRef.current = displaySettings;

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
