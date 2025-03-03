'use client';

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import useNetworkManger from '@/services/NetworkManager';
import useDeviceRotation, {
  DeviceRotation,
  defaultRotation,
} from '@/services/DeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings, LocalStorageItem } from '@/constants';
import { useSearchParams } from 'next/navigation';
import DeviceManager from '@/utils/DeviceManager';
import useCastInfo from '@/services/useCastInfo';
import { ArtFraming, CastInfo } from '@/utils/types';
import { LocalWebSocketClient } from '@/services/local-websocket/LocalWebSocketClient';
import useFrameConfig from '@/services/useArtFraming';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  context: AppConfigContext;
}

interface AppConfigContext {
  isOnline: boolean;
  deviceRotation: DeviceRotation | null;
  appRemoteConfig: AppRemoteConfig;
  castInfo: CastInfo | null;
  frameConfig: ArtFraming | null;
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
  const [, setContextConfig] = useState<AppConfigContext>(
    {} as AppConfigContext
  );
  const [rotation, setRotation] = useState<DeviceRotation | null>(null);
  const [platformInitialized, setPlatformInitialized] = useState(false);

  const { castInfo } = useCastInfo();
  const { frameConfig, setFrameConfig } = useFrameConfig();
  const isOnline = useNetworkManger();

  const deviceRotation = useDeviceRotation(rotation);
  const searchParams = useSearchParams();

  const contextConfig = {
    isOnline,
    deviceRotation,
    appRemoteConfig,
    castInfo,
    frameConfig,
  };

  const initContext = async () => {
    try {
      setContextConfig(contextConfig);
      await initDeviceConfigService();
    } catch (error) {
      console.log('Error init context', error);
    }
  };

  const initDeviceConfigService = async () => {
    try {
      await DeviceManager.init();
      initialOrientation();
      initialArtFrameConfig().catch((error: unknown) => {
        console.log('Error initial art frame config', error);
      });
    } catch (error) {
      console.log('Error init device manager', error);
    }
  };

  const initialOrientation = () => {
    setRotation(defaultRotation());
  };

  const initialArtFrameConfig = async () => {
    try {
      const data = await DeviceManager.getArtFrameConfig();
      if (data === undefined) {
        setFrameConfig(ArtFraming.FitToScreen);
        return;
      }

      setFrameConfig(data);
    } catch (error) {
      console.log('Error initial art frame config', error);
      setFrameConfig(ArtFraming.FitToScreen);
    }
  };

  // Initialize platform events
  useEffect(() => {
    let websocket: LocalWebSocketClient | null = null;
    const platform = searchParams?.get('platform') ?? '';
    if (platform) {
      localStorage.setItem(LocalStorageItem.platform, platform);
      // if (platform === Platform.ffDevice.toString()) {
      //   websocket = new LocalWebSocketClient();
      // }
    }

    websocket = new LocalWebSocketClient();

    setPlatformInitialized(true);

    return () => {
      websocket?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!platformInitialized) return;

    initContext().catch((error: unknown) => {
      console.log('Error init context', error);
    });
  }, [platformInitialized]);

  useEffect(() => {
    setContextConfig({
      ...contextConfig,
      deviceRotation: rotation,
    });
  }, [rotation]);

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

  return (
    <AppContext.Provider
      value={{
        context: {
          isOnline,
          deviceRotation,
          appRemoteConfig,
          castInfo,
          frameConfig,
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
