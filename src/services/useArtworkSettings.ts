import { useEffect, useMemo, useRef, useState } from 'react';
import CanvasService from './CanvasService';
import {
  DisplaySettings,
  TokenDisplaySettings,
} from '@/models/display_settings.model';
import ArtworkService from './ArtworkService';
import { useAppContext } from '@/context/AppContext';
import { LocalWebSocketClient } from './local-websocket/LocalWebSocketClient';

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

  // Services
  const artworkService = useRef(new ArtworkService()).current;
  const canvasService = useRef(CanvasService.getInstance()).current;
  const webSocketClient = useRef(LocalWebSocketClient.getInstance()).current;

  // Load token display settings
  useEffect(() => {
    if (!tokenId) return;

    const fetchTokenSettings = async () => {
      try {
        const config = await artworkService.queryTokenConfiguration(tokenId);
        console.log('[useArtworkSettings] getTokenConfiguration', config);

        if (config) {
          setTokenDisplaySettings(
            TokenDisplaySettings.fromAssetConfiguration(config)
          );
        } else {
          console.warn(
            '[useArtworkSettings] No token config found — requesting device rotation'
          );
          webSocketClient.requestRotateDevice(null);
        }
      } catch (err) {
        console.error('[useArtworkSettings] Failed to load token config:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenSettings().catch((error: unknown) => {
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
        scalingChanged: prev?.scaling !== newSettings.scaling,
        changed: true,
      }));
    };
    canvasService.addDisplaySettingsChangedListener(onSettingsChanged);
    return () => {
      canvasService.removeDisplaySettingsChangedListener(onSettingsChanged);
    };
  }, [tokenId]);

  useEffect(() => {
    console.log(
      '[useArtworkSettings] Token display settings changed',
      tokenDisplaySettings
    );

    if (!tokenDisplaySettings || tokenDisplaySettings.overridable) {
      webSocketClient.requestRotateDevice(null);
    } else {
      const targetOrientation = tokenDisplaySettings.orientation ?? null;
      if (targetOrientation !== context.deviceRotation?.viewMode) {
        webSocketClient.requestRotateDevice(targetOrientation);
      }
    }
  }, [tokenDisplaySettings]);

  const displaySettings = useMemo((): TokenDisplaySettingWithChanged => {
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
