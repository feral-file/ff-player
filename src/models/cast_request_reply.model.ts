import { CursorPosition } from '@/services/custom-hooks/useCursorPositions';
import { TokenDisplaySettings, TombstoneMode } from './display_settings.model';
import { ErrorType } from './error.model';
import { DP1Call, DP1Intent, DP1Item, Scaling } from './dp1.model';
import { CastCommand, LoopMode, RenderStatus, ViewMode } from '.';

export interface CursorOffset {
  dx: number;
  dy: number;
  coefficientX: number;
  coefficientY: number;
}

export type Request = object;

/**
 * Stable, machine-readable classification for a refused command, alongside
 * the free-form `error` string (kept byte-for-byte unchanged for existing
 * consumers reading logs). Currently emitted only by refreshArtwork's three
 * refusal paths; controld's boot-recovery classifier keys off this instead
 * of parsing `error` text, which is not a stable contract across builds.
 */
export type ReplyRefusalCode =
  | 'handler_pending'
  | 'no_artwork'
  | 'preview_update_failed';

export interface Reply {
  ok: boolean;
  // ErrorType for the navigation-error replies; a free-form reason string for
  // command refusals. The daemon surfaces this verbatim when a command is
  // refused (feral-controld reads `message.error` to tell an expected
  // escalation — "No active artwork to refresh" during boot recovery — from
  // an unexpected refusal when reading logs after a bad boot).
  error?: ErrorType | string;
  code?: ReplyRefusalCode;
}

export type ConnectReplyV2 = Reply;
export type DisconnectRequest = Request;
export type DisconnectReplyV2 = Reply;

export interface NowDisplayRequest {
  dp1CallData: DP1Call;
  playlistUrl?: string;
}
export type NowDisplayReply = Reply;

export interface SchedulePlaylistRequest {
  dp1CallData: DP1Call;
  scheduleTime?: string;
}
export type SchedulePlaylistReply = Reply;

export type CheckDeviceStatusRequest = Request;
export interface CheckDeviceStatusReply extends Reply {
  castCommand?: CastCommand;

  playlist?: DP1Call;
  playlistUrl?: string;

  items?: DP1Item[];
  index?: number;
  renderStatus?: RenderStatus;
  isPaused?: boolean;

  // Generation carrier for controld's page-generation tracking (cross-repo
  // recovery design §2.1, source 3): echoes `window.__ffosDocStamp` so a
  // document-stamp mismatch can be detected over this existing 5s
  // checkStatus round-trip instead of a second evaluate. A current player
  // ALWAYS includes this key — '' when the session has not stamped the
  // document yet (a fresh mount, or a foreign/unstamped document), the
  // stamp string once it has. Optional here only because an OLD player
  // (pre-stamp code) omits the key entirely; controld treats absence as
  // "source 3 unavailable" for that player, never as a mismatch.
  stamp?: string;

  deviceSettings?: {
    scaling?: Scaling;
    orientation?: ViewMode;
    // Device-level default item duration in seconds; absent means "auto"
    // (no device override, the playlist's duration cascade stands).
    defaultDuration?: number;
    // Tombstone (museum label) state so ff-app can render the control's
    // current selection (feral-file#3452).
    tombstone?: TombstoneMode;
  };

  sleepMode?: boolean;
  loopMode?: LoopMode;
  shuffle?: boolean;
}

export interface DisplayPlaylistRequest {
  intent?: DP1Intent;
  dp1_call: DP1Call;
  playlistUrl?: string;
  refresh?: boolean;
}
export type DisplayPlaylistReply = Reply;

export interface MoveToArtworkRequest extends Request {
  index: number;
}
export type MoveToArtworkReply = Reply;

export type TapGestureRequest = Request;
export interface DragGestureRequest extends Request {
  cursorOffsets: CursorOffset[];
}
export type GestureReply = Reply;

export type GetCursorOffsetRequest = Request;
export interface GetCursorOffsetReply extends Reply {
  cursorOffset: CursorOffset;
}
export interface SetCursorOffsetRequest extends Request {
  cursorOffset: CursorOffset;
}
export type SetCursorOffsetReply = Reply;

export interface KeyboardEventRequest extends Request {
  code: number;
}
export type KeyboardEventReply = Reply;

export interface UpdateArtFramingRequest extends Request {
  frameConfig: number;
}

export interface UpdateDisplaySettingsRequest extends TokenDisplaySettings {
  tokenId?: string;
  isSaved: boolean;
}

export interface UpdateCursorPositionsRequest extends Request {
  positions: CursorPosition[];
}
export type UpdateCursorPositionsReply = Reply;

export interface SetSleepModeRequest extends Request {
  sleepMode: boolean;
}
export type SetSleepModeReply = Reply;

export interface SetShuffleRequest extends Request {
  enabled: boolean;
}
export type SetShuffleReply = Reply;

export interface SetLoopRequest extends Request {
  mode: string; // 'none' | 'playlist' | 'one'
}
export type SetLoopReply = Reply;

export interface DisplayDefaultPlaylistRequest extends Request {
  // "Make sure something is playing" semantics: when true, the request is a
  // no-op if a playlist is already on screen (e.g. the boot fallback already
  // recovered playback before feral-controld's first-pair push arrived).
  // Absent/false keeps the historical force-reset behavior OOM recovery
  // relies on to replace possibly-OOM-causing content.
  onlyIfNoPlaylist?: boolean;
}
export type DisplayDefaultPlaylistReply = Reply;

/**
 * Sets the device-level default item duration (DP-1 §4.1 device-level
 * override). `durationSeconds` null/absent clears the override ("auto").
 */
export interface UpdateDefaultDurationRequest extends Request {
  durationSeconds?: number | null;
}
export type UpdateDefaultDurationReply = Reply;
