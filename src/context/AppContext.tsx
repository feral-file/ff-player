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
import { useSearchParams } from 'next/navigation';
import DeviceManager from '@/utils/DeviceManager';
import useCastInfo from '@/services/custom-hooks/useCastInfo';
import { CastCommand, CastInfo } from '@/models';
import CanvasService from '@/services/CanvasService';
import { useDeviceSettings } from '@/services/custom-hooks/useDeviceSettings';
import { DisplaySettings } from '@/models/display_settings.model';
import { CDPRequestHandler } from '@/services/cdp-handler/CDPRequestHandler';
import useCursorPositions, {
  CursorPosition,
} from '@/services/custom-hooks/useCursorPositions';
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
  const [platformInitialized, setPlatformInitialized] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { castInfo, setCastInfo } = useCastInfo();
  const { displaySettings, setDisplaySettings } = useDeviceSettings();
  const { cursorPositions } = useCursorPositions();
  const isOnline = useNetworkManger();
  const isFirstRender = useRef(true);

  const deviceRotation = useDeviceRotation();
  const searchParams = useSearchParams();
  const canvasService = useRef(CanvasService.getInstance());

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
      await DeviceManager.init();
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
    let castInfo = getCastInfoFromLocalStorage();

    if (castInfo) {
      const path = window.location.pathname;
      const isDaily = path.includes('daily');
      if (isDaily) {
        // Reset to daily cast info
        castInfo = {
          castCommand: CastCommand.castDaily,
          deviceInfo: castInfo.deviceInfo,
          displayKey: 'daily_work',
        };
      }

      setCastInfo(castInfo);
      canvasService.current.setCastInfo(castInfo, false);
      // TODO: Send cast info to app
    } else {
      console.log('CastInfo is null, send cast daily message');
      // TODO: Send cast info to app
    }
  };

  const getCastInfoFromLocalStorage = () => {
    const castInfoString = localStorage.getItem(LocalStorageItem.castInfo);
    console.log('LocalStorage castInfo', castInfoString);
    if (castInfoString != null) {
      try {
        const castInfo = JSON.parse(castInfoString) as CastInfo;
        return castInfo;
      } catch (error) {
        console.log('Error init cast info', error);
      }
    }

    return null;
  };

  // Initialize platform events
  useEffect(() => {
    const cdpRequestHandler = CDPRequestHandler.getInstance();

    const platform = searchParams.get('platform') ?? '';
    if (platform) {
      localStorage.setItem(LocalStorageItem.platform, platform);
    }

    setPlatformInitialized(true);
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
          new_daily_hour: AppSettings.DEFAULT_NEW_DAILY_HOUR,
        } as AppRemoteConfig);
      }
    };

    fetchConfig().catch((error: unknown) => {
      console.log('[API] Failed to load config:', error);
    });
  }, []);

  useEffect(() => {
    if (!platformInitialized) return;

    initContext().catch((error: unknown) => {
      console.log('Error init context', error);
    });
  }, [platformInitialized]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isOnline) {
      const castInfo = getCastInfoFromLocalStorage();
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
