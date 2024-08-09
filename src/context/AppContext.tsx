'use client';

import { MutableRefObject, ReactNode, createContext } from 'react';
import CanvasService from '../services/CanvasService';
import useWebSocket from '../services/WebSocketManager';
import { CastInfo } from '@/utils/types';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  data: AppContextData;
}

interface AppContextData {
  isFirstInit: boolean;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const WebSocketProvider = ({ children }: AppContextProps) => {
  const data: AppContextData = {
    isFirstInit: true,
  };

  return <AppContext.Provider value={{ data }}>{children}</AppContext.Provider>;
};
