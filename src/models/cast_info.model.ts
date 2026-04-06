import { DP1Call } from './dp1.model';

export enum LoopMode {
  /** Repeat all: wrap to the first slot after the last. */
  playlist = 'playlist',
  /** Repeat one: replay the current slot (handled in playlist client, not in getIndex). */
  one = 'one',
  /** Repeat off: play through once, then stay on the last slot (no wrap). */
  none = 'none',
}

const LOOP_MODE_VALUES = new Set<string>(Object.values(LoopMode));

/**
 * Normalize loop mode from cast commands or remote payloads.
 * Unknown or missing values default to {@link LoopMode.playlist} (repeat-all).
 */
export function coerceLoopMode(raw: string | undefined): LoopMode {
  return raw && LOOP_MODE_VALUES.has(raw) ? (raw as LoopMode) : LoopMode.playlist;
}

export enum CastCommand {
  connect = 'connect',
  disconnect = 'disconnect',
  checkStatus = 'checkStatus',
  pauseCasting = 'pauseCasting',
  resumeCasting = 'resumeCasting',
  nextArtwork = 'nextArtwork',
  previousArtwork = 'previousArtwork',
  moveToArtwork = 'moveToArtwork',
  updateIndex = 'updateIndex',
  updateDuration = 'updateDuration',
  updateArtFraming = 'updateArtFraming',
  updateDisplaySettings = 'updateDisplaySettings',
  cursorUpdate = 'cursorUpdate',
  displayPlaylist = 'displayPlaylist',
  refreshPlaylist = 'refreshPlaylist',
  setSleepMode = 'setSleepMode',
  setShuffle = 'setShuffle',
  setLoop = 'setLoop',
  displayDefaultPlaylist = 'displayDefaultPlaylist',
}

export interface CastInfo {
  castCommand?: CastCommand;

  // Cast list artwork
  startTime?: number;
  index?: number;
  isPaused?: boolean;
  elapsedTime?: number;
  remainTime?: number;
  playlistId?: string;

  // Playback modes
  loopMode?: LoopMode;
  shuffle?: boolean;

  // DP1
  playlist?: DP1Call;
  playlistUrl?: string;
}
