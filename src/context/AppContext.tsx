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
  cacheStringToRotation,
  defaultRotation,
} from '@/services/DeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings, LocalStorageItem, Platform } from '@/constants';
import { useSearchParams } from 'next/navigation';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import DeviceManager from '@/utils/DeviceManager';
import useAppControls, {
  AppControls,
  ArtFraming,
} from '@/services/AppControls';
import useCastInfo from '@/services/useCastInfo';
import { CastInfo } from '@/utils/types';
import { LocalWebSocketClient } from '@/services/local-websocket/LocalWebSocketClient';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  context: AppConfigContext;
}

interface AppConfigContext {
  appControl: AppControls;
  isOnline: boolean;
  deviceRotation: DeviceRotation | null;
  appRemoteConfig: AppRemoteConfig;
  castInfo: CastInfo | null;
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
  const [platform, setPlatform] = useState<Platform | null>(null);

  const { castInfo } = useCastInfo();
  const isOnline = useNetworkManger();
  const appControl = useAppControls(); // Received setting changes from Popup

  const deviceRotation = useDeviceRotation(
    castInfo,
    rotation,
    appControl.rotated
  );
  const searchParams = useSearchParams();

  const contextConfig = {
    appControl,
    isOnline,
    deviceRotation,
    appRemoteConfig,
    castInfo,
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
      initialOrientation().catch((error: unknown) => {
        console.log('Error initial orientation', error);
      });

      initialArtFrameConfig().catch((error: unknown) => {
        console.log('Error initial art frame config', error);
      });
    } catch (error) {
      console.log('Error init device manager', error);
    }
  };

  const initialOrientation = async () => {
    try {
      const data = await DeviceManager.getOrientation();
      if (!data) {
        setRotation(defaultRotation());
        return;
      }

      const orientation = cacheStringToRotation(data);
      setRotation(orientation);
    } catch (error) {
      console.log('Error initial orientation', error);
      setRotation(defaultRotation());
    }
  };

  const initialArtFrameConfig = async () => {
    try {
      const data = await DeviceManager.getArtFrameConfig();
      if (data === undefined) {
        appControl.setFrameConfig(ArtFraming.FitToScreen);
        return;
      }

      appControl.setFrameConfig(data);
    } catch (error) {
      console.log('Error initial art frame config', error);
      appControl.setFrameConfig(ArtFraming.FitToScreen);
    }
  };

  // Initialize platform events
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).KeyEvent = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: KeyEvent.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).DeviceName = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: DeviceName.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).Config = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: Config.handlePlatformEvent,
      };

      const pl = searchParams?.get('platform') ?? '';
      if (pl) {
        localStorage.setItem(LocalStorageItem.platform, pl);
        setPlatform(pl as Platform);
      }
      setPlatformInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!platformInitialized) return;

    initContext().catch((error: unknown) => {
      console.log('Error init context', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformInitialized]);

  useEffect(() => {
    setContextConfig({
      ...contextConfig,
      deviceRotation: rotation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    const websocket = new LocalWebSocketClient();

    return () => {
      websocket.disconnect();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        context: {
          appControl,
          isOnline,
          deviceRotation,
          appRemoteConfig,
          castInfo,
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
