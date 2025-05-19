import { ArtFraming, DisplayOrientation, ViewMode } from '@/models';
import { AssetConfiguration } from './token.model';

export class DisplaySettings {
  scaling?: ArtFraming;
  rotationAngle?: number;

  constructor(scaling?: ArtFraming, rotationAngle?: number) {
    this.scaling = scaling;
    this.rotationAngle = rotationAngle;
  }

  static defaultScaling: ArtFraming = ArtFraming.FitToScreen;
  static defaultRotationAngle = 0;

  static defaultSettings() {
    return new DisplaySettings(
      DisplaySettings.defaultScaling,
      DisplaySettings.defaultRotationAngle
    );
  }

  static getOrientation(
    rotationAngle?: number,
    viewMode?: ViewMode
  ): DisplayOrientation {
    if (!viewMode) {
      viewMode = ViewMode.landscape;
    }

    const angle = (rotationAngle ?? 0) % 360;
    switch (viewMode) {
      case ViewMode.landscape: {
        if (angle === 0) {
          return DisplayOrientation.Landscape;
        } else if (angle === 90) {
          return DisplayOrientation.PortraitReverse;
        } else if (angle === 180) {
          return DisplayOrientation.LandscapeReverse;
        } else if (angle === 270) {
          return DisplayOrientation.Portrait;
        }

        return DisplayOrientation.Landscape;
      }

      case ViewMode.portrait: {
        if (angle === 0) {
          return DisplayOrientation.Portrait;
        } else if (angle === 90) {
          return DisplayOrientation.LandscapeReverse;
        } else if (angle === 180) {
          return DisplayOrientation.PortraitReverse;
        } else if (angle === 270) {
          return DisplayOrientation.Landscape;
        }

        return DisplayOrientation.Portrait;
      }

      default: {
        return DisplayOrientation.Landscape;
      }
    }
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
