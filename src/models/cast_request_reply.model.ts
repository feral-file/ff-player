import { CursorPosition } from '@/services/custom-hooks/useCursorPositions';
import { ViewMode } from './common.model';
import { TokenDisplaySettings } from './display_settings.model';
import { ErrorType } from './error.model';
import { DP1Call, DP1Item, Scaling } from './dp1.model';

export interface DeviceInfo {
  device_name: string;
  device_id: string;
}

export enum ExhibitionCatalog {
  home,
  curatorNote,
  resource,
  resourceDetail,
  artwork,
}

export interface PlayArtwork {
  id: string;
  duration: number;
  token?: {
    id: string;
  };
}

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

export interface ConnectRequestV2 {
  clientDevice: DeviceInfo;
  primaryAddress?: string;
}
export type ConnectReplyV2 = Reply;
export type DisconnectRequest = Request;
export type DisconnectReplyV2 = Reply;

export interface NowDisplayRequest {
  dp1CallData: DP1Call;
}
export type NowDisplayReply = Reply;

export interface SchedulePlaylistRequest {
  dp1CallData: DP1Call;
  scheduleTime?: string;
}
export type SchedulePlaylistReply = Reply;

export type CheckDeviceStatusRequest = Request;
export interface CheckDeviceStatusReply extends Reply {
  items?: DP1Item[];
  index?: number;
  isPaused?: boolean;

  displayKey?: string;

  deviceSettings?: {
    scaling: Scaling;
    orientation: ViewMode;
  };
}

export interface CastExhibitionRequest {
  exhibitionId: string;
  catalogId?: string;
  catalog?: ExhibitionCatalog;
}
export type CastExhibitionReply = Reply;

export interface CastListArtworkRequest {
  artworks: PlayArtwork[];
  startTime?: number;
}
export type CastListArtworkReply = Reply;

export type NextArtworkRequest = Request;
export type NextArtworkReply = Reply;
export type PreviousArtworkRequest = Request;
export type PreviousArtworkReply = Reply;
export type PauseCastingRequest = Request;
export type PauseCastingReply = Reply;
export type ResumeCastingRequest = Request;
export type ResumeCastingReply = Reply;
export interface MoveToArtworkRequest extends Request {
  artwork: { token: { id: string } };
}
export type MoveToArtworkReply = Reply;
export interface UpdateDurationRequest extends Request {
  artworks: PlayArtwork[];
}
export interface UpdateDurationReply extends Reply {
  startTime: number;
  artworks: PlayArtwork[];
}

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
