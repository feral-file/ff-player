'use client';

import { MutableRefObject, ReactNode, createContext } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  data: WebSocketMessage;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
}

export let isFirstOpen: boolean | null = null;

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const data = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );

  return (
    <AppContext.Provider
      value={{
        data,
      }}>
      {children}
    </AppContext.Provider>
  );
};
