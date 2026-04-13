import { DP1Call } from './dp1.model';

export enum LoopMode {
  playlist = 'playlist',
  one = 'one',
}

export enum CastCommand {
  connect = 'connect',
  disconnect = 'disconnect',
  checkStatus = 'checkStatus',
  moveToArtwork = 'moveToArtwork',
  updateIndex = 'updateIndex',
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
  index?: number;
  playlistId?: string;

  // Playback modes
  isPaused?: boolean;
  loopMode?: LoopMode;
  shuffle?: boolean;

  // DP1
  playlist?: DP1Call;
  playlistUrl?: string;
}
