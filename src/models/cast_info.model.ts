import {
  DeviceInfo,
  ExhibitionCatalog,
  PlayArtwork,
} from './cast_request_reply.model';
import { DP1Item } from './dp1.model';

export enum CastCommand {
  connect = 'connect',
  disconnect = 'disconnect',
  checkStatus = 'checkStatus',
  castListArtwork = 'castListArtwork',
  cancelCasting = 'cancelCasting',
  appendArtworkToCastingList = 'appendArtworkToCastingList',
  pauseCasting = 'pauseCasting',
  resumeCasting = 'resumeCasting',
  nextArtwork = 'nextArtwork',
  previousArtwork = 'previousArtwork',
  moveToArtwork = 'moveToArtwork',
  updateIndex = 'updateIndex',
  updateDuration = 'updateDuration',
  castExhibition = 'castExhibition',
  tapGesture = 'tapGesture',
  dragGesture = 'dragGesture',
  setCursorOffset = 'setCursorOffset',
  getCursorOffset = 'getCursorOffset',
  sendKeyboardEvent = 'sendKeyboardEvent',
  castDaily = 'castDaily',
  updateArtFraming = 'updateArtFraming',
  updateDisplaySettings = 'updateDisplaySettings',
  cursorUpdate = 'cursorUpdate',
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
  artworks?: PlayArtwork[];
  startTime?: number;
  index?: number;
  isPaused?: boolean;
  elapsedTime?: number;
  remainTime?: number;

  // Cast daily
  displayKey?: string;

  // DP1
  items?: DP1Item[];
}
