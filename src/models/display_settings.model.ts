import { ArtFraming } from '@/models';
import { AssetConfiguration } from './token.model';

export class DisplaySettings {
  scaling?: ArtFraming;

  constructor(scaling?: ArtFraming) {
    this.scaling = scaling;
  }

  static defaultScaling: ArtFraming = ArtFraming.FitToScreen;

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
    scaling?: ArtFraming,
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
      assetConfiguration.scaling as ArtFraming,
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
