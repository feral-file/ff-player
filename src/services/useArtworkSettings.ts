import { useEffect, useRef, useState } from 'react';
import CanvasService from './CanvasService';
import {
  DisplaySettings,
  TokenDisplaySettings,
} from '@/models/display_settings.model';
import ArtworkService from './ArtworkService';
import { useAppContext } from '@/context/AppContext';

type TokenDisplaySettingWithChanged = TokenDisplaySettings & {
  scalingChanged?: boolean;
  changed?: boolean;
};

export function useArtworkSettings(tokenId: string) {
  const { context } = useAppContext();
  const [tokenDisplaySettings, setTokenDisplaySettings] = useState<
    TokenDisplaySettingWithChanged | undefined
  >();
  const [loading, setLoading] = useState(true);
  const displaySettingsRef = useRef<TokenDisplaySettingWithChanged | undefined>(
    undefined
  );

  // Services
  const artworkService = useRef(new ArtworkService());
  const canvasService = useRef(CanvasService.getInstance());

  // Load token display settings
  useEffect(() => {
    if (!tokenId) return;

    const getTokenConfiguration = async () => {
      try {
        return await artworkService.current.queryTokenConfiguration(tokenId);
      } catch (error) {
        console.log('Error get token configuration', error);
        return undefined;
      }
    };

    const loadSetting = async () => {
      const tokenDisplayConfig = await getTokenConfiguration();
      if (tokenDisplayConfig) {
        setTokenDisplaySettings(
          TokenDisplaySettings.fromAssetConfiguration(tokenDisplayConfig)
        );
      }
      setLoading(false);
    };

    loadSetting().catch((error: unknown) => {
      console.log('Error load setting', error);
    });
  }, [tokenId]);

  // Listen to token display settings changes
  useEffect(() => {
    if (!tokenId) return;

    const handleArtSettingChanged = (
      isSaveToDevice: boolean,
      artSetting: TokenDisplaySettings
    ) => {
      if (isSaveToDevice) {
        return;
      }

      console.log('update artist settings', JSON.stringify(artSetting));
      setTokenDisplaySettings({
        ...displaySettingsRef.current,
        ...artSetting,
        scalingChanged: !!artSetting.scaling,
        changed: true,
      });
    };
    canvasService.current.addDisplaySettingsChangedListener(
      handleArtSettingChanged
    );
    return () => {
      canvasService.current.removeDisplaySettingsChangedListener(
        handleArtSettingChanged
      );
    };
  }, [tokenId]);

  useEffect(() => {
    console.log(
      '[useArtworkSettings] Token display settings changed',
      tokenDisplaySettings
    );

    displaySettingsRef.current = tokenDisplaySettings;
  }, [tokenDisplaySettings]);

  const getDisplaySettings = (): TokenDisplaySettingWithChanged => {
    console.log('tokenDisplaySettings', JSON.stringify(tokenDisplaySettings));
    console.log(
      'context.displaySettings',
      JSON.stringify(context.displaySettings)
    );

    if (!tokenDisplaySettings)
      return context.displaySettings ?? DisplaySettings.defaultSettings();

    if (tokenDisplaySettings.changed) {
      return tokenDisplaySettings;
    }

    if (tokenDisplaySettings.overridable) {
      return {
        ...tokenDisplaySettings,
        ...context.displaySettings,
      };
    }

    return tokenDisplaySettings;
  };

  return {
    loadingSettings: loading,
    displaySettings: getDisplaySettings(),
  };
}
