import { CursorPosition } from '@/services/custom-hooks/useCursorPositions';
import { TokenDisplaySettings } from './display_settings.model';
import { ErrorType } from './error.model';
import { DP1Call, DP1Intent, DP1Item, Scaling } from './dp1.model';
import { CastCommand, LoopMode, ViewMode } from '.';

export interface CursorOffset {
  dx: number;
  dy: number;
  coefficientX: number;
  coefficientY: number;
}

export type Request = object;
export interface Reply {
  ok: boolean;
  error?: ErrorType;
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
  isPaused?: boolean;

  deviceSettings?: {
    scaling?: Scaling;
    orientation?: ViewMode;
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

export type DisplayDefaultPlaylistRequest = Request;
export type DisplayDefaultPlaylistReply = Reply;
