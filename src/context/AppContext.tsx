'use client';

import { MutableRefObject, ReactNode, createContext, useState } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  data: WebSocketMessage;

  isFirstInit: boolean | null;
  setIsFirstInit: (isFirstInit: boolean) => void;
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
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );

  const [isFirstInit, setIsFirstInit] = useState<boolean>(false);

  return (
    <AppContext.Provider value={{ data, isFirstInit, setIsFirstInit }}>
      {children}
    </AppContext.Provider>
  );
};
