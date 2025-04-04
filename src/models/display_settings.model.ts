import { ArtFraming, ViewMode } from '@/utils/types';
import { AssetConfiguration } from './token.model';

export class DisplaySettings {
  scaling?: ArtFraming;
  orientation?: ViewMode;

  constructor(scaling?: ArtFraming, orientation?: ViewMode) {
    this.scaling = scaling;
    this.orientation = orientation;
  }

  static defaultSettings() {
    return new DisplaySettings(ArtFraming.CropToFill, ViewMode.landscape);
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
    orientation?: ViewMode,
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
    super(scaling, orientation);
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

  // tokenDisplaySettings from asset configuration

  static fromAssetConfiguration(assetConfiguration: AssetConfiguration) {
    return new TokenDisplaySettings(
      assetConfiguration.scaling as ArtFraming,
      assetConfiguration.orientation as ViewMode,
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
