import { AppSettings } from '@/constants';
import { ViewMode } from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import { useEffect, useState } from 'react';

export interface DeviceRotation {
  screenRatio: number;
  viewMode?: ViewMode;
}

const useDeviceRotation = () => {
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const resizeHandler = () => {
        let minSize;
        let newViewMode: ViewMode;
        if (window.innerHeight > window.innerWidth) {
          newViewMode = ViewMode.portrait;
          minSize = window.innerWidth;
        } else {
          newViewMode = ViewMode.landscape;
          minSize = window.innerHeight;
        }

        setScreenRatio(minSize / AppSettings.STANDARD_HEIGHT);
        if (newViewMode !== viewMode) {
          setViewMode(newViewMode);
        }
      };

      resizeHandler();

      window.addEventListener('resize', resizeHandler);

      return () => {
        window.removeEventListener('resize', resizeHandler);
      };
    }
  }, []);

  useEffect(() => {
    console.log('viewMode', viewMode);

    if (viewMode) {
      DeviceManager.setViewMode(viewMode);
    }
  }, [viewMode]);

  return { screenRatio, viewMode };
};

export default useDeviceRotation;
