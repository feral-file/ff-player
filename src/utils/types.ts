export interface WebSocketMessage {
  messageID: string;
  message: any;
}

export interface CommandRequest {
  command: string;
  request: any;
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

export interface CastlistInfo {
  artworks: PlayArtworkV2[];
  startTime: number;
  deviceInfo?: DeviceInfoV2;
  exhibitionId?: string;
}

export interface DeviceInfoV2 {
  deviceId: string;
  deviceName: string;
}

export interface PlayArtworkV2 {
  id: string;
  duration: number;
}

export interface ConnectRequestV2 {
  clientDevice: DeviceInfoV2;
}

export interface ConnectReplyV2 extends Reply {}
export interface DisconnectReplyV2 extends Reply {}
export interface CheckDeviceStatusRequest {}
export interface CheckDeviceStatusReply extends Reply {
  startTime: number;
  artworks: PlayArtworkV2[];
  connectedDevice?: DeviceInfoV2;
  exhibitionId?: string;
  displayKey?: string;
}
export interface CastExhibitionRequest {
  exhibitionId: string;
  catalogId?: string;
  catalog: string;
}
export interface CastExhibitionReply extends Reply {}
export interface CastListArtworkRequest {
  startTime?: number;
  artworks: PlayArtworkV2[];
}
export interface CastListArtworkReply extends Reply {}
export interface NextArtworkRequest {}
export interface NextArtworkReply extends Reply {}
export interface PauseCastingRequest {}
export interface PauseCastingReply extends Reply {}
export interface ResumeCastingRequest {}
export interface ResumeCastingReply extends Reply {}
export interface PreviousArtworkRequest {}
export interface PreviousArtworkReply extends Reply {}
export interface MoveToArtworkRequest {
  artwork: { token: { id: string } };
}
export interface MoveToArtworkReply extends Reply {}
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
export interface TapGestureRequest {}
export interface DragGestureRequest {
  cursorOffsets: CursorOffset[];
}
export interface GestureReply extends Reply {}
export interface CursorOffset {
  dx: number;
  dy: number;
  coefficientX: number;
  coefficientY: number;
}
export interface GetCursorOffsetRequest {}
export interface GetCursorOffsetReply extends Reply {
  cursorOffset: CursorOffset;
}
export interface SetCursorOffsetRequest {
  cursorOffset: CursorOffset;
}
export interface SetCursorOffsetReply extends Reply {}
export interface KeyboardEventRequest {
  code: number;
}
export interface KeyboardEventReply extends Reply {}

export interface Artwork {
  id: string;
  seriesID: string;
  index: number;
  previewURI: string;
  thumbnailURI: string;
  series?: Series;
  artistAlias?: string;
  blockchain?: string;
  contractAddress?: string;
}

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
  artwork: Artwork;
  duration: number;
  previewURL: string;
  token: {
    id: string;
  };
}

export interface CastInfo {
  artworks?: PlayArtworkV2[];
  startTime?: number;
  castCommand?: CastCommand;
  deviceInfo?: any;
  exhibitionId?: string;
  value?: any;
  displayKey?: string;
  dataChecked?: boolean;
}

export enum ViewMode {
  landscape = 'landscape',
  portrait = 'portrait',
}

export interface Daily {
  id: string;
  blockchain: string;
  contractAddress: string;
  displayTime: string;
  tokenID: string;
  previewURL?: string;
}

export enum Orientation {
  vertical = 'vertical',
  horizontal = 'horizontal',
}
