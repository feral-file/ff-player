'use client';

import {
  MutableRefObject,
  ReactNode,
  createContext,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';
import { usePathname } from 'next/navigation';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  data: WebSocketMessage;

  isFirstOpen: boolean | null;
  setIsFirstOpen: (value: boolean) => void;
}

interface WebSocketMessage {
  locationID: string | null;
  topicID: string | null;
  castInfo: CastInfo | null;
  canvasService: MutableRefObject<CanvasService>;
}

let isFirstOpen: boolean | null = null;

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const data = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );

  const pathname = usePathname();

  if (isFirstOpen === null) {
    if (pathname === '/') {
      isFirstOpen = true;
    } else {
      isFirstOpen = false;
    }
  }

  return (
    <AppContext.Provider
      value={{
        data,
        isFirstOpen,
        setIsFirstOpen: (value: boolean) => {
          isFirstOpen = value;
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
