import { AppSettings } from '@/constants';
import { Orientation, ViewMode } from '@/utils/types';
import { useEffect, useState } from 'react';

const useDeviceRotation = () => {
  const [screenOrientation, setScreenOrientation] = useState<Orientation>(
    Orientation.horizontal
  );
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const resizeHandler = () => {
        let minSize;
        if (window.innerHeight > window.innerWidth) {
          setViewMode(ViewMode.portrait);
          minSize = window.innerWidth;
          setScreenOrientation(Orientation.vertical);
        } else {
          setViewMode(ViewMode.landscape);
          minSize = window.innerHeight;
          setScreenOrientation(Orientation.horizontal);
        }

        setScreenRatio(minSize / AppSettings.STANDARD_HEIGHT);
      };

      resizeHandler();
    }
  }, []);

  return { screenOrientation, screenRatio, viewMode, rotateRadius: 0 };
};

export default useDeviceRotation;
