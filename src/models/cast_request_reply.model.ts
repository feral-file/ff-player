import { TokenDisplaySettings } from './display_settings.model';

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
}

export interface ConnectRequestV2 {
  clientDevice: DeviceInfo;
  primaryAddress?: string;
}
export type ConnectReplyV2 = Reply;
export type DisconnectRequest = Request;
export type DisconnectReplyV2 = Reply;

export type CheckDeviceStatusRequest = Request;
export interface CheckDeviceStatusReply extends Reply {
  connectedDevice?: DeviceInfo;

  exhibitionId?: string;
  catalog?: ExhibitionCatalog;
  catalogId?: string;

  artworks?: PlayArtwork[];
  startTime?: number;
  index?: number;
  isPaused?: boolean;

  displayKey?: string;
}

export interface CastExhibitionRequest {
  exhibitionId: string;
  catalogId?: string;
  catalog?: ExhibitionCatalog;
}
export type CastExhibitionReply = Reply;

export interface CastListArtworkRequest {
  startTime?: number;
  artworks: PlayArtwork[];
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

export interface RotateRequest extends Request {
  clockwise: boolean;
}
export interface RotateReply extends Reply {
  degree: number;
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
