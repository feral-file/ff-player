import { Artwork, IndexerToken } from '@/models';

export interface WebSocketMessage {
  messageID: string;
  message: unknown;
}

export interface CommandRequest {
  command: string;
  request: unknown;
}

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
  updateDuration = 'updateDuration',
  castExhibition = 'castExhibition',
  rotate = 'rotate',
  tapGesture = 'tapGesture',
  dragGesture = 'dragGesture',
  setCursorOffset = 'setCursorOffset',
  getCursorOffset = 'getCursorOffset',
  sendKeyboardEvent = 'sendKeyboardEvent',
  castDaily = 'castDaily',
}

export interface Reply {
  ok: boolean;
}

export interface DeviceInfo {
  device_name: string;
  device_id: string;
}

export interface PlayArtworkV2 {
  id: string;
  duration: number;
  token?: {
    id: string;
    name: string;
  };
}

export interface ConnectRequestV2 {
  clientDevice: DeviceInfo;
  primaryAddress?: string;
}

export type ConnectReplyV2 = Reply;
export type DisconnectReplyV2 = Reply;
export type CheckDeviceStatusRequest = object;
export interface CheckDeviceStatusReply extends Reply {
  startTime: number;
  artworks: PlayArtworkV2[];
  connectedDevice?: DeviceInfo;
  exhibitionId?: string;
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
  artworks: PlayArtworkV2[];
}
export type CastListArtworkReply = Reply;
export type NextArtworkRequest = object;
export type NextArtworkReply = Reply;
export type PauseCastingRequest = object;
export type PauseCastingReply = Reply;
export type ResumeCastingRequest = object;
export type ResumeCastingReply = Reply;
export type PreviousArtworkRequest = object;
export type PreviousArtworkReply = Reply;
export interface MoveToArtworkRequest {
  artwork: { token: { id: string } };
}
export type MoveToArtworkReply = Reply;
export interface UpdateDurationRequest {
  artworks: PlayArtworkV2[];
}
export interface UpdateDurationReply extends Reply {
  startTime: number;
  artworks: PlayArtworkV2[];
}
export interface RotateRequest {
  clockwise: boolean;
}
export interface RotateReply extends Reply {
  degree: number;
}
export type TapGestureRequest = object;
export interface DragGestureRequest {
  cursorOffsets: CursorOffset[];
}
export type GestureReply = Reply;
export interface CursorOffset {
  dx: number;
  dy: number;
  coefficientX: number;
  coefficientY: number;
}
export type GetCursorOffsetRequest = object;
export interface GetCursorOffsetReply extends Reply {
  cursorOffset: CursorOffset;
}
export interface SetCursorOffsetRequest {
  cursorOffset: CursorOffset;
}
export type SetCursorOffsetReply = Reply;
export interface KeyboardEventRequest {
  code: number;
}
export type KeyboardEventReply = Reply;

export interface Series {
  id: string;
  previewFile?: FileInfo;
  artistID: string;
  title: string;
}

export interface FileInfo {
  filename: string;
  uri: string;
  status: string;
  version: string;
}

export enum SeriesPreviewHTMLTag {
  iframe = 'iframe',
  iframePDF = 'iframePDF',
  object = 'object',
  video = 'video',
  audio = 'audio',
  image = 'image',
  stream = 'stream',
}

export const FileUseIframe: string[] = ['html', 'text/html'];
export const FileUseIframePDF: string[] = ['pdf', 'application/pdf'];
export const FileUseObject: string[] = ['txt'];
export const FileUseVideo: string[] = [
  'mp4',
  'mov',
  'wmv',
  'quicktime',
  'avi',
  'webm',
  'mkv',
];
export const FileUseAudio: string[] = ['mp3', 'm4a', 'wav', 'wma', 'aac'];
export const FileUseImage: string[] = [
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
  'svg',
  'application/xml',
];
export const MIMETypeUseStream: string[] = ['application/x-mpegurl'];
export const MIMETypeVideo = 'video/*';
export const MIMETypeAudio = 'audio/*';
export const MIMETypeImage = 'image/*';
export const MIMETypeObject = 'text/csv';

export interface PlaylistToken {
  artwork?: Artwork;
  duration: number;
  previewURL: string;
  contractAddress?: string;
  token: {
    id: string;
    name: string;
  };
  indexerToken?: IndexerToken;
}

export interface CastInfo {
  artworks?: PlayArtworkV2[];
  startTime?: number;
  castCommand?: CastCommand;
  deviceInfo?: DeviceInfo;
  value?: string | number;

  // Cast exhibition
  exhibitionId?: string;
  catalogId?: string;
  catalog?: ExhibitionCatalog;
  displayKey?: string;
  dataChecked?: boolean;
}

// Enum for ExhibitionCatalog
export enum ExhibitionCatalog {
  home,
  curatorNote,
  resource,
  resourceDetail,
  artwork,
}

export enum ViewMode {
  landscape = 'landscape',
  portrait = 'portrait',
}

export enum Orientation {
  vertical = 'vertical',
  horizontal = 'horizontal',
}

export enum MessageModalType {
  error = 'error',
  warning = 'warning',
  info = 'info',
}
