'use client';

import { IndexerToken } from '@/models';
import React, { createContext, useContext, useState } from 'react';

interface PopUpContextProps {
  displayInfo?: DisplayInfoProps;
  setDisplayInfo: (displayInfo: DisplayInfoProps | undefined) => void;
}

interface DisplayInfoProps {
  token: IndexerToken | undefined; // Required if "isCastingSingleArt" is true
  ffArtworkID?: string; // Required if "isCastingSingleArt" is true and for FF art only
  dailyNote?: string; // Required if "isCastingSingleArt" is true and for Daily art only
}

export const PopUpContext = createContext<PopUpContextProps | undefined>(
  undefined
);

export const usePopUpContext = () => {
  const context = useContext(PopUpContext);
  if (!context) {
    throw new Error('usePopUpContext must be used within a PopUpProvider');
  }
  return context;
};

export const PopUpProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [displayInfo, setDisplayInfo] = useState<DisplayInfoProps | undefined>(
    undefined
  );

  return (
    <PopUpContext.Provider
      value={{
        displayInfo,
        setDisplayInfo,
      }}>
      {children}
    </PopUpContext.Provider>
  );
};
