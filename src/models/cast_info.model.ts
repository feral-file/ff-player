import { DP1Call } from './dp1.model';

export enum LoopMode {
  playlist = 'playlist',
  one = 'one',
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
