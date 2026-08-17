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

// ---- Manifest envelope: the content behind DP1Item.ref, or carried inline ----
//
// These interfaces are a hand-written transcription of the ref-manifest JSON
// Schema (dp1 `core/v1.1.0/ref-manifest.json`). Nothing generates them and
// nothing checks them against it, so the mapping is written out below; when
// the spec moves, this table is what tells the next reader what to change.
//
//   Object              Schema `required`        Modelled here as
//   ------------------  ----------------------   ------------------------------
//   RefManifest         refVersion, id,          same four required, rest ?
//                       created, locale
//   metadata            (none)                   every field ?
//   metadata.artists[]  (none)                   every field ?
//   thumbnails.*        uri                      uri required, rest ?
//   controls            (none)                   every field ?
//
// Optionality here is not a style choice, it decides which documents compile.
// The interfaces used to require ~10 fields the schema lets a producer omit,
// so a manifest that dp1-go's own ParseAndValidateRefManifest accepts — a
// title, one artist with just a name, a thumbnail with just a uri — failed to
// typecheck.
//
// That was inert for a long time because a manifest only ever arrived as
// `axios.get<RefManifest>(...)`: an assertion over parsed JSON, which
// TypeScript never verifies, so nothing had to satisfy the type. It stopped
// being inert when DP1Item gained `inlineManifest` (playlists ext §3.6),
// because a manifest became something you WRITE — in a fixture, a mock, a
// playlist builder — and therefore something the compiler checks, against a
// description that was wrong. An over-required type leaves the author two bad
// options: invent values the spec says may be absent, or cast the check away
// exactly where it is worth most.
//
// The test fixtures in useTombstoneInfo.test.tsx and
// playlistDisplayPreference.test.ts deliberately build manifests with NO `as`
// cast for that reason: they stop compiling if these types drift back to
// over-required.
//
// Note the direction runs both ways. Being too LAX is the more dangerous
// error now: an inline manifest that omits a schema-required field is a
// document `feral-controld` will reject on the dynamicQuery acceptance path —
// and dp1-go fails the whole batch rather than skipping the bad item, so one
// under-specified manifest takes down a whole cast.
export interface RefManifest {
  refVersion: string;
  id: string; // unique identifier (for caching)
  created: string;
  // Required by the schema, despite reading like a nicety: a manifest with no
  // locale is invalid, and an invalid inlineManifest fails its whole playlist
  // (see the note above). Modelled required so a fixture cannot omit it.
  locale: string; // 'en' as the conventional default
  metadata?: RefManifestMetadata;
  controls?: RefManifestControls;
  i18n?: Record<string, unknown>;
}

// Schema `required`: none. A manifest may carry a metadata block with only
// the one field its producer actually holds — see the mapping table on
// RefManifest for why every field here is therefore optional.
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
