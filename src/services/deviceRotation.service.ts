import { AppSettings } from '@/constants';
import { Orientation, ViewMode } from '@/utils/types';

export interface DeviceRotation {
  screenOrientation: Orientation;
  screenRatio: number;
  viewMode: ViewMode | null;
  rotateRadius: number;
}

class DeviceRotationService {
  public static defaultRotation = () => {
    let minSize;
    let viewMode: ViewMode | null = null;
    let screenOrientation: Orientation = Orientation.horizontal;
    let screenRatio = 1;
    if (window.innerHeight > window.innerWidth) {
      viewMode = ViewMode.portrait;
      minSize = window.innerWidth;
      screenOrientation = Orientation.vertical;
    } else {
      viewMode = ViewMode.landscape;
      minSize = window.innerHeight;
      screenOrientation = Orientation.horizontal;
    }

    screenRatio = minSize / AppSettings.STANDARD_HEIGHT;

    return {
      screenOrientation,
      screenRatio,
      viewMode,
      rotateRadius: 0,
    };
  };

  public static rotationToCacheString = (r: DeviceRotation) => {
    return `${r.screenOrientation}|${r.screenRatio}|${r.viewMode}|${r.rotateRadius}`;
  };

  public static cacheStringToRotation = (s: string): DeviceRotation => {
    const [screenOrientation, screenRatio, viewMode, rotateRadius] =
      s.split('|');

    return {
      screenOrientation: screenOrientation as Orientation,
      screenRatio: parseFloat(screenRatio),
      viewMode: viewMode as ViewMode,
      rotateRadius: parseInt(rotateRadius, 10),
    };
  };
}

export default DeviceRotationService;
