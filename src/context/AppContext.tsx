'use client';

import {
  MutableRefObject,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';
import useNetworkManger from '@/services/NetworkManager';
import useDeviceRotation, {
  DeviceRotation,
  cacheStringToRotation,
  defaultRotation,
} from '@/services/DeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings } from '@/constants';
import { useSearchParams } from 'next/navigation';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import DeviceManager from '@/utils/DeviceManager';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  context: AppConfigContext;
}

interface AppConfigContext {
  websocketData: WebSocketMessage;
  isOnline: boolean;
  deviceRotation: DeviceRotation | null;
  appRemoteConfig: AppRemoteConfig;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
  isDisconnected: boolean;
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
  const [_, setContextConfig] = useState<AppConfigContext>(
    {} as AppConfigContext
  );
  const [rotation, setRotation] = useState<DeviceRotation | null>(null);
  const [platformInitialized, setPlatformInitialized] = useState(false);

  const websocketData = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? ''}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY ?? ''
  );
  const isOnline = useNetworkManger();
  const deviceRotation = useDeviceRotation(websocketData.castInfo, rotation);
  const searchParams = useSearchParams();

  const initialOrientation = async () => {
    try {
      const data = await DeviceManager.getOrientation();
      if (!data) {
        setRotation(defaultRotation());
        return;
      }

      console.log('Initial orientation from cache', data);
      const orientation = cacheStringToRotation(data);
      console.log('Parsed orientation from cache', orientation);
      setRotation(orientation);
    } catch (error) {
      console.log('Error initial orientation', error);
      setRotation(defaultRotation());
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

      const pl = searchParams.get('platform') ?? '';
      if (pl) {
        localStorage.setItem('platform', pl);
      }
      setPlatformInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log('platformInitialized', platformInitialized);
    if (!platformInitialized) return;

    setContextConfig({
      websocketData,
      isOnline,
      deviceRotation,
      appRemoteConfig,
    });
    initialOrientation().catch((error: unknown) => {
      console.log('Error initial orientation', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformInitialized]);

  useEffect(() => {
    setContextConfig({
      websocketData,
      isOnline,
      deviceRotation,
      appRemoteConfig,
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
          websocketData,
          isOnline,
          deviceRotation,
          appRemoteConfig,
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
