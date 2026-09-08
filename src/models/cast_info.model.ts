import { DP1Call } from './dp1.model';
import { RenderStatus } from './render_status.model';
import type { ContentContext } from '@/services/contentPolicy';

export enum LoopMode {
  none = 'none',
  playlist = 'playlist',
  one = 'one',
}

export enum CastCommand {
  connect = 'connect',
  disconnect = 'disconnect',
  checkStatus = 'checkStatus',
  moveToArtwork = 'moveToArtwork',
  updateIndex = 'updateIndex',
  refreshArtwork = 'refreshArtwork',
  updateArtFraming = 'updateArtFraming',
  updateDisplaySettings = 'updateDisplaySettings',
  cursorUpdate = 'cursorUpdate',
  displayPlaylist = 'displayPlaylist',
  refreshPlaylist = 'refreshPlaylist',
  setSleepMode = 'setSleepMode',
  setShuffle = 'setShuffle',
  setLoop = 'setLoop',
  displayDefaultPlaylist = 'displayDefaultPlaylist',
  updateDefaultDuration = 'updateDefaultDuration',
}

export interface CastInfo {
  // Unsigned origin metadata; retained through recovery and history replay.
  contentContext?: ContentContext;
  castCommand?: CastCommand;

  // Cast list artwork
  index?: number;
  playlistId?: string;

  // Playback modes
  isPaused?: boolean;
  loopMode?: LoopMode;
  shuffle?: boolean;
  renderStatus?: RenderStatus;

  // DP1
  playlist?: DP1Call;
  playlistUrl?: string;
}
