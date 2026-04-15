import { DisplayOrientation } from './common.model';

export interface DP1 {
  intent: DP1Intent;
  dp1_call: DP1Call;
  playlistUrl?: string;
}

export interface DP1Intent {
  action: DP1Action;
  schedule_time?: string;
}

export interface DP1Call {
  dpVersion: string;
  id?: string;
  title: string;
  slug?: string;
  created?: string;
  note?: DP1Note;
  defaults?: DP1Defaults;
  items?: DP1Item[];
  signature?: string;
}

export interface DP1Note {
  text: string;
  /** Intermission length in seconds (DP-1 Playlist Extension `note.duration`; default 20 when omitted). */
  duration?: number;
}

export enum DP1Action {
  NowDisplay = 'now_display',
  SchedulePlay = 'schedule_play',
  GetCurrentPlaylist = 'get_current_playlist',
  DisplayAtBoot = 'display_at_boot',
}

export interface DP1Defaults {
  display: DP1DisplayPreference;
  license: DP1License;
  duration: number;
}

export interface DP1Item {
  id: string;
  title?: string;
  slug?: string;
  source: string;
  note?: DP1Note;
  duration?: number;
  license: DP1License;
  ref?: string; // URL ipfs:// or https://... (content-addressed preferred)
  refHash?: string; // When "ref" uses HTTPS, the "refHash" field is required for integrity.
  override?: {
    duration?: number;
    display?: DP1DisplayPreference;
    license?: DP1License;
    repro?: DP1Repro;
    provenance?: DP1Provenance;
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
  interaction?: {
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
  type?: DP1ProvenanceType;
  contract?: {
    chain: DP1Chain;
    standard?: string;
    address: string;
    seriesId?: number;
    tokenId: string;
    uri?: string;
    metaHash?: string;
  };

  dependencies?: {
    chain?: DP1Chain;
    standard?: string;
    uri?: string;
  }[];
}

export enum DP1License {
  Open = 'open',
  Token = 'token',
  Subscription = 'subscription',
}

export enum DP1Chain {
  EVM = 'evm',
  Bitmark = 'bitmark',
  Tezos = 'tezos',
  Other = 'other',
}

export enum DP1Type {
  SeriesRegistry = 'seriesRegistry',
  OnChainURI = 'onChainURI',
  OffChainURI = 'offChainURI',
}

export enum DP1ProvenanceType {
  OnChain = 'onChain',
  SeriesRegistry = 'seriesRegistry',
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

// ---- Manifest envelope which content from "ref" of DP1Item ----
export interface RefManifest {
  refVersion: string;
  id: string; // unique identifier (for caching)
  created: string;
  locale?: string; // 'en' as default locale
  metadata?: RefManifestMetadata;
  controls?: RefManifestControls;
  i18n?: Record<string, unknown>;
}

export interface RefManifestMetadata {
  title: string;
  artists: { name: string; id: string; url?: string }[];
  creditLine: string;
  description: string;
  tags: string[];
  thumbnails: {
    small: RefManifestThumbnail;
    large: RefManifestThumbnail;
    xlarge: RefManifestThumbnail;
    default: RefManifestThumbnail;
  };
}

interface RefManifestThumbnail {
  uri: string;
  w: number;
  h: number;
  sha256: string;
}

export interface RefManifestControls {
  display: DP1DisplayPreference;
  safety: {
    orientation: DisplayOrientation[]; // ['landscape', 'portrait', 'any']
    maxCpuPct: number;
    maxMemMB: number;
  };
}
