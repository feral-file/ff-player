import { AppSettings } from '@/constants';
import { ViewMode } from '@/utils/types';
import { useEffect, useState } from 'react';

export interface DeviceRotation {
  screenRatio: number;
  viewMode: ViewMode | null;
}

const defaultRotation = () => {
  let minSize;
  let viewMode: ViewMode | null = null;
  let screenRatio = 1;
  if (window.innerHeight > window.innerWidth) {
    viewMode = ViewMode.portrait;
    minSize = window.innerWidth;
  } else {
    viewMode = ViewMode.landscape;
    minSize = window.innerHeight;
  }

  screenRatio = minSize / AppSettings.STANDARD_HEIGHT;

  return {
    screenRatio,
    viewMode,
  };
};

const useDeviceRotation = (cacheSetting: DeviceRotation | null) => {
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const resizeHandler = () => {
        let minSize;
        if (window.innerHeight > window.innerWidth) {
          setViewMode(ViewMode.portrait);
          minSize = window.innerWidth;
        } else {
          setViewMode(ViewMode.landscape);
          minSize = window.innerHeight;
        }

        setScreenRatio(minSize / AppSettings.STANDARD_HEIGHT);
      };

      resizeHandler();
    }
  }, []);

  useEffect(() => {
    if (cacheSetting) {
      setScreenRatio(cacheSetting.screenRatio);
      setViewMode(cacheSetting.viewMode);
    }
  }, [cacheSetting]);

  return { screenRatio, viewMode };
};

export default useDeviceRotation;
export { defaultRotation };
