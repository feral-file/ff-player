import { useEffect, useMemo, useRef, useState } from 'react';
import CanvasService from './CanvasService';
import {
  DisplaySettings,
  TokenDisplaySettings,
} from '@/models/display_settings.model';
import ArtworkService from './ArtworkService';
import { useAppContext } from '@/context/AppContext';

export type TokenDisplaySettingWithChanged = TokenDisplaySettings & {
  changed?: boolean;
};

export function useArtworkSettings(tokenId: string) {
  const { context } = useAppContext();
  const [tokenDisplaySettings, setTokenDisplaySettings] = useState<
    TokenDisplaySettingWithChanged | null | undefined
  >();
  const [loading, setLoading] = useState(true);

  // Services
  const artworkService = useRef(new ArtworkService()).current;
  const canvasService = useRef(CanvasService.getInstance()).current;

  // Load token display settings
  useEffect(() => {
    if (!tokenId) return;

    const getTokenSettings = async () => {
      try {
        setLoading(true);
        const config = await artworkService.queryTokenConfiguration(tokenId);
        console.log('[useArtworkSettings] getTokenConfiguration', config);

        if (config) {
          return TokenDisplaySettings.fromAssetConfiguration(config);
        } else {
          console.warn('[useArtworkSettings] No token config found');
          return null;
        }
      } catch (err) {
        console.error('[useArtworkSettings] Failed to load token config:', err);
        return null;
      } finally {
        setLoading(false);
      }
    };

    getTokenSettings()
      .then(settings => {
        setTokenDisplaySettings(settings);
      })
      .catch((error: unknown) => {
        console.log('Error fetch token settings', error);
      });
  }, [tokenId]);

  // Listen to token display settings changes
  useEffect(() => {
    if (!tokenId) return;

    const onSettingsChanged = (
      isSaveToDevice: boolean,
      newSettings: TokenDisplaySettings
    ) => {
      if (isSaveToDevice) return;

      console.log('[useArtworkSettings] Updating artist settings', newSettings);
      setTokenDisplaySettings(prev => ({
        ...prev,
        ...newSettings,
        changed: true,
      }));
    };
    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, [tokenId]);

  const displaySettings = useMemo(():
    | TokenDisplaySettingWithChanged
    | undefined => {
    // ignore first render
    if (tokenDisplaySettings === undefined) return undefined;

    console.log('[useArtworkSettings] displaySettings', tokenDisplaySettings);
    console.log(
      '[useArtworkSettings] context.displaySettings',
      context.displaySettings
    );
    if (!tokenDisplaySettings) {
      return context.displaySettings ?? DisplaySettings.defaultSettings();
    }

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
  }, [tokenDisplaySettings, context.displaySettings]);

  return {
    loadingSettings: loading,
    displaySettings,
  };
}
