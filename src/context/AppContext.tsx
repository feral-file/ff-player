'use client';

import {
  MutableRefObject,
  ReactNode,
  createContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo, Orientation, ViewMode } from '@/utils/types';
import useNetworkManger from '@/services/NetworkManager';
import useDeviceRotation from '@/services/DeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings } from '@/constants';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
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

interface DeviceRotation {
  screenOrientation: Orientation;
  screenRatio: number;
  viewMode: ViewMode | null;
  rotateRadius: number;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const [appRemoteConfig, setAppConfig] = useState({} as AppRemoteConfig);
  const remoteConfigService = useRef(new RemoteConfigService());

  const websocketData = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? ''}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY ?? ''
  );

  const isOnline = useNetworkManger();
  const deviceRotation = useDeviceRotation(websocketData.castInfo);

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
        websocketData,
        isOnline,
        deviceRotation,
        appRemoteConfig,
      }}>
      {children}
    </AppContext.Provider>
  );
};
