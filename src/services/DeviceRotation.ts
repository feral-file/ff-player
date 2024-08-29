import { AppSettings } from '@/constants';
import { CastCommand, CastInfo, Orientation, ViewMode } from '@/utils/types';
import { useEffect, useState } from 'react';

const useDeviceRotation = (castInfo: CastInfo | null) => {
  const [screenOrientation, setScreenOrientation] = useState<Orientation>(
    Orientation.horizontal
  );
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [rotateRadius, setRotateRadius] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const resizeHandler = () => {
        let minSize;
        console.log('window.innerHeight', window.innerHeight);
        console.log('window.innerWidth', window.innerWidth);

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

  useEffect(() => {
    if (castInfo && castInfo.castCommand === CastCommand.rotate) {
      setViewMode(
        viewMode === ViewMode.landscape ? ViewMode.portrait : ViewMode.landscape
      );
      setRotateRadius(rotateRadius + 90);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castInfo]);

  return { screenOrientation, screenRatio, viewMode, rotateRadius };
};

export default useDeviceRotation;
