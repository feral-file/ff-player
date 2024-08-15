'use client';

import { MutableRefObject, ReactNode, createContext } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo, Orientation, ViewMode } from '@/utils/types';
import useNetworkManger from '@/services/NetworkManager';
import useDeviceRotation from '@/services/DeviceRotation';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  websocketData: WebSocketMessage;
  isOnline: boolean;
  deviceRotation: DeviceRotation | null;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
}

interface DeviceRotation {
  screenOrientation: Orientation;
  screenRatio: number;
  viewMode: ViewMode | null;
  rotateRadius: number;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const websocketData = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? ''}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY ?? ''
  );

  const isOnline = useNetworkManger();
  const deviceRotation = useDeviceRotation(websocketData.castInfo);

  return (
    <AppContext.Provider
      value={{
        websocketData,
        isOnline,
        deviceRotation,
      }}>
      {children}
    </AppContext.Provider>
  );
};
