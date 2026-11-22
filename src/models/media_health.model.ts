/**
 * `mediaHealth` contract v1 (feral-file/ffos-user#392): controld's broken-source
 * hints on the cast and the player's per-play outcome ring in status.
 *
 * Both halves are unsigned, controld-owned projections that ride BESIDE the
 * DP-1 body, like `contentContext`. Neither is persisted: a hint describes the
 * push it arrived on, and an outcome describes a mount on this page. Boot and
 * hydrate therefore never see either, which is the "live-only" rule
 * `renderStatus` already follows.
 *
 * The wire strings here are stable tokens read by controld's categoriser, not
 * free text. Add values; never rename or renumber.
 */

/**
 * One hinted-broken item. `category` is controld's closed app-facing set
 * (`source_missing`, `not_media`, ...) and `reason` the detail code behind it.
 * The player never interprets either: a present entry means "skip this
 * source", whatever the words say.
 */
export interface MediaHealthHint {
  category: string;
  reason: string;
}

/**
 * Sparse map keyed by `item.source` as pushed, broken entries only. A
 * 1,000-item wall with three broken works carries three keys.
 */
export type MediaHealthHints = Record<string, MediaHealthHint>;

/** Runtime list so the manifest test can pin the wire tokens to the type. */
export const PLAYBACK_OUTCOME_KINDS = ['ok', 'fail', 'skip'] as const;
export type PlaybackOutcomeKind = (typeof PLAYBACK_OUTCOME_KINDS)[number];

/**
 * Where in the play pipeline an outcome was decided. `webgl` is device-local
 * (a GPU loss on this panel, never a source verdict); `hint` is the player
 * confirming it honoured a controld hint; `ready` is the one `ok` stage.
 */
export const PLAYBACK_OUTCOME_STAGES = [
  'detect',
  'load',
  'decode',
  'watchdog',
  'webgl',
  'exhausted',
  'hint',
  'ready',
] as const;
export type PlaybackOutcomeStage = (typeof PLAYBACK_OUTCOME_STAGES)[number];

/** One ring entry. `code` is the stage's detail token; `mediaType` the resolved renderer when known. */
export interface PlaybackOutcomeEntry {
  seq: number;
  /**
   * The cast generation this entry was recorded under. Fixed on the entry,
   * unlike the snapshot's own `castSeq`, so `(castSeq, seq)` stays the same
   * identity on every later poll even after a new cast opened.
   */
  castSeq: number;
  source: string;
  kind: PlaybackOutcomeKind;
  stage: PlaybackOutcomeStage;
  code?: string;
  mediaType?: string;
  /** 1-based attempt within the per-item retry budget; 0 for a hint skip. */
  attempt: number;
  /** Mount to outcome; 0 for a hint skip, which never mounts. */
  elapsedMs: number;
  /** ISO-8601 wall-clock time the entry was recorded. */
  at: string;
}

/** What `checkStatus.outcomes` carries. */
export interface PlaybackOutcomes {
  /** The CURRENT cast generation: increments on every accepted Now Display; resets with the page. Entries keep their own. */
  castSeq: number;
  /** Oldest first, at most `PLAYBACK_OUTCOME_RING_SIZE` entries. */
  entries: PlaybackOutcomeEntry[];
}

/** An entry as a producer records it; the ring assigns `seq`, `castSeq`, and `at`. */
export type PlaybackOutcomeInput = Omit<
  PlaybackOutcomeEntry,
  'seq' | 'castSeq' | 'at'
>;

/** A failure as the renderer sees it, before the attempt and timing are known. */
export interface PlaybackFailure {
  stage: Exclude<PlaybackOutcomeStage, 'hint' | 'ready'>;
  code?: string;
}

export const PLAYBACK_OUTCOME_RING_SIZE = 64;

/**
 * `setMediaHealth`: replace the held hint map for the cast on the wall
 * without a re-cast. `castSeq` fences it to the outcome-ring generation the
 * map was computed for; `mediaHealth` is the same sparse map a push carries,
 * replace semantics (absent or malformed means no hints).
 */
export interface SetMediaHealthRequest {
  castSeq?: unknown;
  mediaHealth?: unknown;
}

/** Refusals: the map is left untouched in both cases. */
export type SetMediaHealthError = 'staleCast' | 'invalidCastSeq';

/** `{ok:true, skippedIndices}` (as `checkStatus` would report next) or a refusal. */
export type SetMediaHealthReply =
  | { ok: true; skippedIndices: number[] }
  | { ok: false; error: SetMediaHealthError };
