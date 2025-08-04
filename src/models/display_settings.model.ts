import { Scaling } from './dp1.model';

export class DeviceDisplaySettings {
  scaling?: Scaling;

  constructor(scaling?: Scaling) {
    this.scaling = scaling;
  }

  static defaultScaling: Scaling = Scaling.Fit;

  static defaultSettings() {
    return new DeviceDisplaySettings(DeviceDisplaySettings.defaultScaling);
  }
}
