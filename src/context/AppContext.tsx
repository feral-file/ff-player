'use client';

import { ReactNode, createContext } from 'react';
import { Orientation, ViewMode } from '@/utils/types';
import useNetworkManger from '@/services/NetworkManager';
import useDeviceRotation from '@/services/DeviceRotation';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  isOnline: boolean;
  deviceRotation: DeviceRotation | null;
}

interface DeviceRotation {
  screenOrientation: Orientation;
  screenRatio: number;
  viewMode: ViewMode | null;
  rotateRadius: number;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: AppContextProps) => {
  const isOnline = useNetworkManger();
  const deviceRotation = useDeviceRotation();

  return (
    <AppContext.Provider
      value={{
        isOnline,
        deviceRotation,
      }}>
      {children}
    </AppContext.Provider>
  );
};
