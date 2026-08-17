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
  defaults?: DP1Defaults;
  items?: DP1Item[];
  signature?: string;
  // Human-readable curator name, tolerant read aligned with the DP-1
  // playlist-group `curator` field (core/v1.1.0). Drives the tombstone's
  // "Curated by" line (feral-file#3452); absent means the playlist did not
  // come from a curated source and the line is omitted.
  curator?: string;
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
  // A complete Ref Manifest carried inside the playlist instead of behind
  // `ref` (playlists extension §3.6) — the same document, validated by the
  // unmodified ref-manifest schema, and already covered by the playlist
  // signature (there is no `refHash` counterpart because the bytes never
  // leave the signed document).
  //
  // Outranked by a manifest actually fetched from `ref`, which §3.6 makes
  // authoritative; this is the offline/degraded carriage. It is also the
  // standardized replacement for `metadata` below, and unlike `ref` it
  // needs no network round trip, so an item carrying only this resolves
  // its label and display preferences synchronously.
  inlineManifest?: RefManifest;
  // Tolerant read of inline label metadata mirroring the ref-manifest
  // metadata block (dp1 core/v1.1.0 ref-manifest.md §4). Not in playlist
  // core: playlist builders that host no ref manifest (today's ff-cli) can
  // carry artist/title data inline for the tombstone (feral-file#3452).
  // Predates `inlineManifest` and is outranked by it; kept for playlists
  // already in the field. A resolved ref manifest outranks both.
  metadata?: RefManifestMetadata;
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

// Every field here is optional because the ref-manifest schema
// (core/v1.1.0/ref-manifest.json) declares no `required` list on `metadata`,
// none on an `artists` entry, and only `["uri"]` on a thumbnail. Requiring
// them here would reject documents the spec accepts: a manifest carrying just
// a title and an artist name is valid, and dp1-go's own
// ParseAndValidateRefManifest accepts it.
//
// That divergence sat harmless while a manifest only ever arrived as
// `axios.get<RefManifest>(...)` — an assertion over parsed JSON, which
// TypeScript never checks. It stopped being harmless when DP1Item gained
// `inlineManifest`, because a manifest can now be WRITTEN as a literal
// (fixtures, mocks, playlist builders) and is therefore checked. An
// over-required type leaves the author two bad options: invent values the
// spec says may be absent, or cast the check away exactly where it is worth
// most.
export interface RefManifestMetadata {
  title?: string;
  artists?: { name?: string; id?: string; url?: string }[];
  creditLine?: string;
  description?: string;
  tags?: string[];
  // Partial because the schema names no required size key either: a producer
  // may ship only `default`, or only `small`.
  thumbnails?: Partial<
    Record<'small' | 'large' | 'xlarge' | 'default', RefManifestThumbnail>
  >;
}

interface RefManifestThumbnail {
  // The one field the schema actually requires.
  uri: string;
  // `required` was relaxed from ["uri","w","h"] to ["uri"] in the core
  // changelog of 2026-08-12: producers holding only a bare thumbnail URL omit
  // the dimensions rather than guess them. sha256 was never required.
  //
  // Nothing reads any of this today. Typed honestly anyway, so the first
  // reader is forced to handle the absent case instead of inheriting a
  // guarantee that does not exist.
  w?: number;
  h?: number;
  sha256?: string;
}

// Optional for the same reason as RefManifestMetadata: the schema declares no
// `required` on `controls`. A manifest that only pins display preferences and
// says nothing about safety limits is valid, and is the common shape.
export interface RefManifestControls {
  display?: DP1DisplayPreference;
  safety?: {
    orientation?: DisplayOrientation[]; // ['landscape', 'portrait', 'any']
    maxCpuPct?: number;
    maxMemMB?: number;
  };
}
