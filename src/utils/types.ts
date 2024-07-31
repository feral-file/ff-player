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
