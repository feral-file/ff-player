import { AppSettings } from '@/constants';
import { CastCommand, CastInfo, Orientation, ViewMode } from '@/utils/types';
import { useEffect, useState } from 'react';
import DeviceManager from '@/utils/DeviceManager';

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

      const orientationSetting = async () => {
        const catchOrientationSetting = await DeviceManager.getOrientation();

        if (catchOrientationSetting) {
          const orientation = JSON.parse(catchOrientationSetting);
          setScreenOrientation(orientation.screenOrientation);
          setScreenRatio(orientation.screenRatio);
          setViewMode(orientation.viewMode);
          setRotateRadius(orientation.rotateRadius);
        } else {
          resizeHandler();
        }
      };

      orientationSetting();
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

  if (viewMode === null) {
    return null;
  }

  const rotateSetting = {
    screenOrientation,
    screenRatio,
    viewMode,
    rotateRadius,
  };
  DeviceManager.setOrientation(JSON.stringify(rotateSetting));
  return rotateSetting;
};

export default useDeviceRotation;
