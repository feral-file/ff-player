'use client';

import { MutableRefObject, ReactNode, createContext } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';
import networkManger from '@/services/NetworkManager';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  data: WebSocketMessage;
  isOnline: boolean;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const data = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? ''}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY ?? ''
  );

  const isOnline = networkManger();

  return (
    <AppContext.Provider
      value={{
        data,
        isOnline,
      }}>
      {children}
    </AppContext.Provider>
  );
};
