'use client';

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import useNetworkManger from '@/services/custom-hooks/useNetworkManager';
import useDeviceRotation, {
  DeviceRotation,
} from '@/services/custom-hooks/useDeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings, LocalStorageItem } from '@/constants';
import DeviceManager from '@/utils/DeviceManager';
import useCastInfo from '@/services/custom-hooks/useCastInfo';
import { CastInfo, CastCommand } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { useDeviceSettings } from '@/services/custom-hooks/useDeviceSettings';
import { DisplaySettings } from '@/models/display_settings.model';
import { CDPRequestHandler } from '@/services/cdp-handler/CDPRequestHandler';
import useCursorPositions, {
  CursorPosition,
} from '@/services/custom-hooks/useCursorPositions';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { stripLegacyCastPlaybackTimeline } from '@/utils/castInfo';
import { useRouter } from 'next/navigation';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  context: AppConfigContext;
}

interface AppConfigContext {
  isInitialized: boolean;
  isOnline: boolean;
  deviceRotation?: DeviceRotation;
  appRemoteConfig: AppRemoteConfig;
  castInfo: CastInfo | null;
  displaySettings: DisplaySettings | null;
  cursorPositions: CursorPosition[] | null;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within a AppProvider');
  }

  return context;
};

/* eslint-disable max-lines-per-function -- single provider owns boot + subscriptions */
export const AppProvider = ({ children }: AppContextProps) => {
  const [appRemoteConfig, setAppConfig] = useState({} as AppRemoteConfig);
  const remoteConfigService = useRef(new RemoteConfigService());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isFallbackPlaylist, setIsFallbackPlaylist] = useState(false);

  const { castInfo, setCastInfo } = useCastInfo();
  const { displaySettings, setDisplaySettings } = useDeviceSettings();
  const { cursorPositions } = useCursorPositions();
  const router = useRouter();
  const isOnline = useNetworkManger();
  const isFirstRender = useRef(true);

  const deviceRotation = useDeviceRotation();

  const initContext = async () => {
    try {
      await initDeviceConfigService();
      setIsInitialized(true);
    } catch (error) {
      console.log('Error init context', error);
    }
  };

  const initDeviceConfigService = async () => {
    try {
      console.log('[AppContext] initDeviceConfigService');
      await initialDisplaySettings();
      await initCastInfo();
    } catch (error) {
      console.log('Error init device manager', error);
    }
  };

  const initialDisplaySettings = async () => {
    console.log('[AppContext] initialDisplaySettings');
    const displaySettings = await DeviceManager.getDeviceDisplaySettings();
    if (displaySettings) {
      setDisplaySettings(displaySettings);
    }
  };

  const navigateToHomePage = () => {
    if (window.location.pathname !== '/') {
      console.log('navigate to home page');
      router.push('/');
    }
  };

  const initCastInfo = async () => {
    console.log('[AppContext] initCastInfo');

    let castInfo: CastInfo | null = null;
    const bootPlaylist = await DeviceManager.getBootPlaylist();
    if (bootPlaylist?.items?.length) {
      console.log('[AppContext] Boot playlist found, casting boot playlist');
      castInfo = {
        castCommand: CastCommand.displayPlaylist,
        playlist: bootPlaylist,
        index: 0,
        isPaused: false,
        playlistId: bootPlaylist.id,
      };
    }

    if (!castInfo) {
      castInfo = await DeviceManager.getCastInfo();
    }

    if (castInfo) {
      const criticalTempValue = await DeviceManager.getItem(
        LocalStorageItem.criticalTemp
      );
      const hasCriticalTemp = criticalTempValue === 'true';
      if (hasCriticalTemp) {
        // Fetch and cast default playlist after critical temp reset
        setIsFallbackPlaylist(true);
        await DeviceManager.removeItem(LocalStorageItem.criticalTemp);
        return;
      }

      if (castInfo.castCommand?.toString() === 'castDaily') {
        setIsFallbackPlaylist(true);
        return;
      }

      if (castInfo.playlist?.items?.length && castInfo.index !== undefined) {
        const normalizedIndex = normalizePlaylistIndex(
          castInfo.index,
          castInfo.playlist.items.length
        );
        if (normalizedIndex !== castInfo.index) {
          castInfo = {
            ...castInfo,
            index: normalizedIndex,
          };
        }
      }

      const cleanCastInfo = stripLegacyCastPlaybackTimeline(castInfo);
      setCastInfo(cleanCastInfo);
      canvasService.setCastInfo(cleanCastInfo, false);
      navigateToHomePage();
    } else {
      // Cast default playlist
      console.log('[AppContext] No castInfo found, fetching default playlist');
      setIsFallbackPlaylist(true);
    }
  };

  const fallbackPlaylist = () => {
    console.log('[AppContext] Fallback default playlist');
    canvasService
      .castPlaylistByURL(appRemoteConfig.defaultPlaylistURL)
      .then(() => {
        navigateToHomePage();
      })
      .catch((error: unknown) => {
        console.error('[AppContext] Error fetching default playlist:', error);
      });
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const appRemoteConfig =
          await remoteConfigService.current.getAppRemoteConfig();
        setAppConfig(appRemoteConfig);
      } catch (error) {
        console.log('[API] Failed to load config:', error);
        setAppConfig({
          defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
        });
      }
    };

    fetchConfig().catch((error: unknown) => {
      console.log('[API] Failed to load config:', error);
    });
  }, []);

  useEffect(() => {
    const cdpRequestHandler = CDPRequestHandler.getInstance();
    return () => {
      cdpRequestHandler.cleanup();
    };
  }, []);

  useEffect(() => {
    if (appRemoteConfig.defaultPlaylistURL && isFallbackPlaylist) {
      fallbackPlaylist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react when URL + fallback flag change only
  }, [appRemoteConfig.defaultPlaylistURL, isFallbackPlaylist]);

  useEffect(() => {
    initContext().catch((error: unknown) => {
      console.error('[AppContext] Error initializing context:', error);
    });
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isOnline) {
      DeviceManager.getCastInfo()
        .then((castInfo: CastInfo | null) => {
          if (castInfo) {
            // TODO: Send cast info to app
          }
        })
        .catch((error: unknown) => {
          console.error('[AppContext] Error getting cast info:', error);
        });
    }
  }, [isOnline]);

  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized,
          isOnline,
          deviceRotation,
          appRemoteConfig,
          castInfo,
          displaySettings,
          cursorPositions,
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
