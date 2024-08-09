'use client';

import { MutableRefObject, ReactNode, createContext } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';

interface WebSocketContextProps {
  children: ReactNode;
}

interface WebSocketContextValue {
  data: WebSocketMessage;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
}

export const WebSocketContext = createContext<
  WebSocketContextValue | undefined
>(undefined);

export const WebSocketProvider = ({ children }: WebSocketContextProps) => {
  const data = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );

  return (
    <WebSocketContext.Provider value={{ data }}>
      {children}
    </WebSocketContext.Provider>
  );
};
