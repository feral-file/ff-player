import { Scaling } from './dp1.model';

/**
 * Device-level tombstone (museum label) state for feral-file#3452.
 * Rides the existing display-settings cast command as an optional field, so
 * older ff-app builds that omit it keep working (absent = keep last value;
 * players fall back to `Timed` when nothing was ever set).
 * - `Timed`: label shows for the auto-dismiss window on each item, then hides.
 * - `On`: label stays visible for the whole item.
 * - `Off`: label never renders.
 */
export enum TombstoneMode {
  Timed = 'timed',
  On = 'on',
  Off = 'off',
}

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
  // Optional so persisted pre-tombstone settings deserialize unchanged; read
  // sites resolve absence to `TombstoneMode.Timed` (the product default).
  tombstone?: TombstoneMode;

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

  // Options-object constructor (the positional 10-parameter form predated
  // the changed-file max-params gate); `fromAssetConfiguration` remains the
  // public entry point.
  constructor(assetConfiguration: AssetConfiguration = {}) {
    super(assetConfiguration.scaling as Scaling);
    this.backgroundColor = assetConfiguration.backgroundColor;
    this.marginLeft = assetConfiguration.marginLeft;
    this.marginRight = assetConfiguration.marginRight;
    this.marginTop = assetConfiguration.marginTop;
    this.marginBottom = assetConfiguration.marginBottom;
    this.autoPlay = assetConfiguration.autoPlay;
    this.looping = assetConfiguration.looping;
    this.interactable = assetConfiguration.interactable;
    this.overridable = assetConfiguration.overridable;
  }

  static fromAssetConfiguration(assetConfiguration: AssetConfiguration) {
    return new TokenDisplaySettings(assetConfiguration);
  }
}
