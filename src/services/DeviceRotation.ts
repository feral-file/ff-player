import { AppSettings } from '@/constants';
import { CastCommand, CastInfo, Orientation, ViewMode } from '@/utils/types';
import { useEffect, useState } from 'react';
import DeviceManager from '@/utils/DeviceManager';
import DeviceRotationService, {
  DeviceRotation,
} from './deviceRotation.service';

const useDeviceRotation = (
  castInfo: CastInfo | null,
  cacheSetting: DeviceRotation | null
) => {
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

  useEffect(() => {
    if (cacheSetting) {
      setScreenOrientation(cacheSetting.screenOrientation);
      setScreenRatio(cacheSetting.screenRatio);
      setViewMode(cacheSetting.viewMode);
      setRotateRadius(cacheSetting.rotateRadius);
    }
  }, [cacheSetting]);

  useEffect(() => {
    if (rotateRadius === 0) {
      return;
    }

    const rotateSetting = {
      screenOrientation,
      screenRatio,
      viewMode,
      rotateRadius,
    };
    const cacheString =
      DeviceRotationService.rotationToCacheString(rotateSetting);
    DeviceManager.setOrientation(cacheString);
  }, [rotateRadius]);

  return { screenOrientation, screenRatio, viewMode, rotateRadius };
};

export default useDeviceRotation;
