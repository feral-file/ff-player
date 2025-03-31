import { useEffect, useRef, useState } from 'react';
import { DisplaySettings } from '../utils/types';
import CanvasService from './CanvasService';

type DisplaySettingWithChanged = DisplaySettings & {
  viewModeChanged?: boolean;
};

const NOW_DISPLAY_SETTINGS_KEY = 'now_display_settings';

export function useArtworkSettings(tokenId: string) {
  const [displaySettings, setDisplaySettings] = useState<
    DisplaySettingWithChanged | undefined
  >();
  const displaySettingsRef = useRef<DisplaySettingWithChanged | undefined>(
    undefined
  );

  const getNowDisplaySetting = () => {
    const savedSettings = localStorage.getItem(NOW_DISPLAY_SETTINGS_KEY);
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings) as DisplaySettings;
      } catch (error) {
        console.log('Error get display settings from local storage', error);
        return DisplaySettings.defaultSettings();
      }
    }

    return DisplaySettings.defaultSettings();
  };

  useEffect(() => {
    if (!tokenId) return;

    const loadSetting = () => {
      const savedSettings = getNowDisplaySetting();
      setDisplaySettings(savedSettings);
    };

    const handleArtSettingChanged = (artSetting: DisplaySettings | null) => {
      setDisplaySettings({
        ...displaySettingsRef.current,
        ...artSetting,
        viewModeChanged: !!artSetting?.viewMode,
      });
    };

    const canvasService = CanvasService.getInstance();
    canvasService.onDisplaySettingsUpdated = handleArtSettingChanged;
    loadSetting();

    return () => {
      canvasService.onDisplaySettingsUpdated = null;
      localStorage.removeItem(NOW_DISPLAY_SETTINGS_KEY);
    };
  }, [tokenId]);

  useEffect(() => {
    displaySettingsRef.current = displaySettings;
    if (displaySettings) {
      localStorage.setItem(
        NOW_DISPLAY_SETTINGS_KEY,
        JSON.stringify(displaySettings)
      );
    }
  }, [displaySettings]);

  return { displaySettings };
}
