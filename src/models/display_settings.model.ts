import { Scaling } from './dp1.model';

interface AssetConfiguration {
  scaling?: string;
  backgroundColor?: string;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  autoPlay?: boolean;
  looping?: boolean;
  interactable?: boolean;
  overridable?: boolean;
}

export class DisplaySettings {
  scaling?: Scaling;

  constructor(scaling?: Scaling) {
    this.scaling = scaling;
  }

  static defaultScaling: Scaling = Scaling.Fit;

  static defaultSettings() {
    return new DisplaySettings(DisplaySettings.defaultScaling);
  }
}

export class TokenDisplaySettings extends DisplaySettings {
  backgroundColor?: string;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  autoPlay?: boolean;
  looping?: boolean;
  interactable?: boolean;
  overridable?: boolean;

  constructor(
    scaling?: Scaling,
    backgroundColor?: string,
    marginLeft?: number,
    marginRight?: number,
    marginTop?: number,
    marginBottom?: number,
    autoPlay?: boolean,
    looping?: boolean,
    interactable?: boolean,
    overridable?: boolean
  ) {
    super(scaling);
    this.backgroundColor = backgroundColor;
    this.marginLeft = marginLeft;
    this.marginRight = marginRight;
    this.marginTop = marginTop;
    this.marginBottom = marginBottom;
    this.autoPlay = autoPlay;
    this.looping = looping;
    this.interactable = interactable;
    this.overridable = overridable;
  }

  static fromAssetConfiguration(assetConfiguration: AssetConfiguration) {
    return new TokenDisplaySettings(
      assetConfiguration.scaling as Scaling,
      assetConfiguration.backgroundColor,
      assetConfiguration.marginLeft,
      assetConfiguration.marginRight,
      assetConfiguration.marginTop,
      assetConfiguration.marginBottom,
      assetConfiguration.autoPlay,
      assetConfiguration.looping,
      assetConfiguration.interactable,
      assetConfiguration.overridable
    );
  }
}
