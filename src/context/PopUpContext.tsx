'use client';

import { IndexerToken } from '@/models';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAppContext } from './AppContext';

interface PopUpContextProps {
  displayInfo?: DisplayInfoProps;
  setDisplayInfo: (displayInfo: DisplayInfoProps | undefined) => void;

  artDisplaySetting?: ArtDisplaySetting;
  setArtDisplaySetting: (
    artDisplaySetting: ArtDisplaySetting | undefined
  ) => void;
  resetArtDisplaySetting: () => void;
}

interface DisplayInfoProps {
  token: IndexerToken | undefined; // Required if "isCastingSingleArt" is true
  indexID?: string; // Required if token is undefined
  ffArtworkID?: string; // Required if "isCastingSingleArt" is true and for FF art only
  dailyNote?: string; // Required if "isCastingSingleArt" is true and for Daily art only
}

interface ArtDisplaySetting {
  rotateRadius: number;
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
  const [artDisplaySetting, setArtDisplaySetting] = useState<
    ArtDisplaySetting | undefined
  >();

  const { context } = useAppContext();

  useEffect(() => {
    const setting = {
      rotateRadius: 0, // Reset rotation if the device is rotated
    };

    setArtDisplaySetting(setting);
  }, [context.deviceRotation?.rotateRadius]);

  const resetArtDisplaySetting = () => {
    const setting = {
      rotateRadius: 0,
    };
    setArtDisplaySetting(setting);
  };

  return (
    <PopUpContext.Provider
      value={{
        displayInfo,
        setDisplayInfo,
        artDisplaySetting,
        setArtDisplaySetting,
        resetArtDisplaySetting,
      }}>
      {children}
    </PopUpContext.Provider>
  );
};
