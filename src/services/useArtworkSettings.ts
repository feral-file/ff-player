import { useEffect, useRef, useState } from 'react';
import { DisplaySettings } from '../utils/types';
import CanvasService from './CanvasService';

type DisplaySettingWithChanged = DisplaySettings & {
  viewModeChanged?: boolean;
};

export function useArtworkSettings(tokenId: string) {
  const [displaySettings, setDisplaySettings] = useState<
    DisplaySettingWithChanged | undefined
  >();
  const displaySettingsRef = useRef<DisplaySettingWithChanged | undefined>(
    undefined
  );

  useEffect(() => {
    const handleArtSettingChanged = (artSetting: DisplaySettings | null) => {
      if (artSetting?.tokenId === tokenId) {
        setDisplaySettings({
          ...displaySettingsRef.current,
          ...artSetting,
          viewModeChanged: !!artSetting.viewMode,
        });
      }
    };

    const canvasService = CanvasService.getInstance();
    canvasService.onDisplaySettingsUpdated = handleArtSettingChanged;

    return () => {
      canvasService.onDisplaySettingsUpdated = null;
    };
  }, []);

  useEffect(() => {
    displaySettingsRef.current = displaySettings;
  }, [displaySettings]);

  useEffect(() => {
    if (!tokenId) return;

    function loadSetting() {
      setDisplaySettings(DisplaySettings.defaultSettings(tokenId));
    }

    loadSetting();
  }, [tokenId]);

  return { displaySettings };
}
