export interface DP1 {
  intent: DP1Intent;
  dp1_call: DP1Call;
}

export interface DP1Intent {
  action: DP1Action;
  schedule_time?: string;
}

export interface DP1Call {
  dpVersion: string;
  id: string;
  created: string;
  defaults: DP1Defaults;
  items: DP1Item[];
  signature: string;
}

export enum DP1Action {
  NowDisplay = 'now_display',
  SchedulePlay = 'schedule_play',
  GetCurrentPlaylist = 'get_current_playlist',
}

export interface DP1Defaults {
  display: DP1DisplayPreference;
}

export interface DP1Item {
  id: string;
  title: string;
  source: string;
  duration: number;
  license: DP1License;
  ref: string;
  override: {
    duration: number;
  };
  display?: DP1DisplayPreference;
  repro?: DP1Repro;
  provenance?: DP1Provenance;
}

export enum Scaling {
  Fit = 'fit',
  Fill = 'fill',
  Stretch = 'stretch',
  Auto = 'auto',
}

export interface DP1DisplayPreference {
  scaling?: Scaling;
  margin?: number | string;
  background?: string;
  autoPlay?: boolean;
  loop?: boolean;
  interaction: {
    keyboard?: string[];
    mouse?: {
      click?: boolean;
      scroll?: boolean;
      drag?: boolean;
      hover?: boolean;
    };
  };
  userOverrides?: boolean;
}

export interface DP1Repro {
  engineVersion?: {
    chromium?: string;
  };
  seed?: string;
  assetsSHA256?: string[];
  frameHash?: {
    sha256?: string;
    phash?: string;
  };
}

export interface DP1Provenance {
  scheme?: string; // or series-reg / offchain
  ref?: string; // template-encoded pointer: $namespace:$chainId:$container:$identifier
  metaHash?: string; // SHA256 hash of the metadata (optional)
}

export enum DP1License {
  Open = 'open',
  Token = 'token',
  Subscription = 'subscription',
}

export enum DP1Chain {
  EVM = 'evm',
  Tezos = 'tezos',
  Other = 'other',
}

export enum DP1Type {
  SeriesRegistry = 'seriesRegistry',
  OnChainURI = 'onChainURI',
  OffChainURI = 'offChainURI',
}

export const defaultDP1DisplayPreference: DP1DisplayPreference = {
  scaling: Scaling.Fit,
  margin: 0,
  background: '#000000',
  autoPlay: true,
  loop: true,
  interaction: {
    keyboard: [],
    mouse: {
      click: false,
      scroll: false,
      drag: false,
      hover: false,
    },
  },
  userOverrides: true,
};
