import { AppSettings } from '@/constants';
import { AppContext } from '@/context/AppContext';
import { CastCommand, Orientation, ViewMode } from '@/utils/types';
import { useContext, useEffect, useState } from 'react';

const useDeviceRotation = () => {
  const context = useContext(AppContext);
  if (!context) {
    return null;
  }
  const { castInfo } = context.data;

  const [screenOrientation, setScreenOrientation] = useState<Orientation>(
    Orientation.horizontal
  );
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [rotateRadius, setRotateRadius] = useState<number>(0);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('window', window);

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

  useEffect(() => {
    if (castInfo && castInfo.castCommand === CastCommand.rotate) {
      setViewMode(
        viewMode === ViewMode.landscape ? ViewMode.portrait : ViewMode.landscape
      );
      setRotateRadius(rotateRadius + 90);
    }
  }, [castInfo]);

  return { screenOrientation, screenRatio, viewMode, rotateRadius };
};

export default useDeviceRotation;
