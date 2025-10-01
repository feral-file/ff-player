import { DeviceInfo, ExhibitionCatalog } from './cast_request_reply.model';
import { DP1Call } from './dp1.model';

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
  castExhibition = 'castExhibition',
  updateArtFraming = 'updateArtFraming',
  updateDisplaySettings = 'updateDisplaySettings',
  cursorUpdate = 'cursorUpdate',
  displayPlaylist = 'displayPlaylist',
  refreshPlaylist = 'refreshPlaylist',
}

export interface CastInfo {
  castCommand?: CastCommand;
  deviceInfo?: DeviceInfo;
  value?: string | number;

  // Cast exhibition
  exhibitionId?: string;
  catalogId?: string;
  catalog?: ExhibitionCatalog;

  // Cast list artwork
  startTime?: number;
  index?: number;
  isPaused?: boolean;
  elapsedTime?: number;
  remainTime?: number;
  playlistId?: string;

  // DP1
  playlist?: DP1Call;
  playlistUrl?: string;
}
