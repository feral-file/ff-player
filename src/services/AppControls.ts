import { useEffect, useState } from 'react';
import DeviceManager from '@/utils/DeviceManager';

export enum ArtFraming {
  FitToScreen,
  CropToFill,
}

export interface AppControls {
  frameConfig: ArtFraming | undefined;
  setFrameConfig: (frame: ArtFraming) => void;
  setIsFrameConfigChanged: (changed: boolean) => void;
  rotated: boolean;
  setRotated: (rotated: boolean) => void;
}

const useAppControls = () => {
  const [frameConfig, setFrameConfig] = useState<ArtFraming>();
  const [isFrameConfigChanged, setIsFrameConfigChanged] =
    useState<boolean>(false);
  const [rotated, setRotated] = useState<boolean>(false);

  useEffect(() => {
    if (frameConfig !== undefined && isFrameConfigChanged) {
      DeviceManager.setArtFrameConfig(frameConfig);
    }
  }, [frameConfig, isFrameConfigChanged]);

  return {
    frameConfig,
    setFrameConfig,
    setIsFrameConfigChanged,
    rotated,
    setRotated,
  };
};

export default useAppControls;
