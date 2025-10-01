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
import { CastInfo } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { useDeviceSettings } from '@/services/custom-hooks/useDeviceSettings';
import { DisplaySettings } from '@/models/display_settings.model';
import { CDPRequestHandler } from '@/services/cdp-handler/CDPRequestHandler';
import useCursorPositions, {
  CursorPosition,
} from '@/services/custom-hooks/useCursorPositions';
import { recalculateStartTimeForIndex } from '@/utils/playlist';
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

export const AppProvider = ({ children }: AppContextProps) => {
  const [appRemoteConfig, setAppConfig] = useState({} as AppRemoteConfig);
  const remoteConfigService = useRef(new RemoteConfigService());
  const [isInitialized, setIsInitialized] = useState(false);

  const { castInfo, setCastInfo } = useCastInfo();
  const { displaySettings, setDisplaySettings } = useDeviceSettings();
  const { cursorPositions } = useCursorPositions();
  const isOnline = useNetworkManger();
  const isFirstRender = useRef(true);

  const deviceRotation = useDeviceRotation();

  const initContext = () => {
    try {
      initDeviceConfigService();
      setIsInitialized(true);
    } catch (error) {
      console.log('Error init context', error);
    }
  };

  const initDeviceConfigService = () => {
    try {
      console.log('[AppContext] initDeviceConfigService');
      initialDisplaySettings();
      initCastInfo();
    } catch (error) {
      console.log('Error init device manager', error);
    }
  };

  const initialDisplaySettings = () => {
    console.log('[AppContext] initialDisplaySettings');
    const displaySettings = DeviceManager.getDeviceDisplaySettings();
    if (displaySettings) {
      setDisplaySettings(displaySettings);
    }
  };

  const initCastInfo = () => {
    console.log('[AppContext] initCastInfo');
    let castInfo = DeviceManager.getCastInfo();

    if (castInfo) {
      const hasCriticalTemp =
        localStorage.getItem(LocalStorageItem.criticalTemp) === 'true';
      if (hasCriticalTemp) {
        // Reset to default playlist
        castInfo = {
          deviceInfo: castInfo.deviceInfo,
        };
        // Fetch and cast default playlist after critical temp reset
        canvasService.castDefaultPlaylist().catch((error: unknown) => {
          console.error(
            '[AppContext] Error fetching default playlist after critical temp:',
            error
          );
        });
        localStorage.removeItem(LocalStorageItem.criticalTemp);
        return;
      } else if (castInfo.playlist?.items && castInfo.index !== undefined) {
        // Recalculate startTime based on current index to ensure correct display
        console.log(
          '[AppContext] Recalculating startTime for index:',
          castInfo.index
        );
        const newStartTime = recalculateStartTimeForIndex(
          castInfo.playlist.items,
          castInfo.index
        );
        castInfo = {
          ...castInfo,
          startTime: newStartTime,
        };
        console.log('[AppContext] New startTime calculated:', newStartTime);
      }

      localStorage.removeItem(LocalStorageItem.criticalTemp);
      setCastInfo(castInfo);
      canvasService.setCastInfo(castInfo, false);
    } else {
      // Cast default playlist
      console.log('[AppContext] No castInfo found, fetching default playlist');
      canvasService.castDefaultPlaylist().catch((error: unknown) => {
        console.error('[AppContext] Error fetching default playlist:', error);
      });
    }
  };

  useEffect(() => {
    const cdpRequestHandler = CDPRequestHandler.getInstance();
    return () => {
      cdpRequestHandler.cleanup();
    };
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const appRemoteConfig =
          await remoteConfigService.current.getAppRemoteConfig();
        setAppConfig(appRemoteConfig);
      } catch {
        // Return default value if failed to load config
        setAppConfig({
          duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
        } as AppRemoteConfig);
      }
    };

    fetchConfig().catch((error: unknown) => {
      console.log('[API] Failed to load config:', error);
    });
  }, []);

  useEffect(() => {
    initContext();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isOnline) {
      const castInfo = DeviceManager.getCastInfo();
      if (castInfo) {
        // TODO: Send cast info to app
      }
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
