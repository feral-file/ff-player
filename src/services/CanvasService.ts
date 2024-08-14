import DeviceManager from '@/utils/DeviceManager';
import {
  WebSocketMessage,
  CastCommand,
  Reply,
  ConnectRequestV2,
  ConnectReplyV2,
  DisconnectReplyV2,
  CheckDeviceStatusRequest,
  CheckDeviceStatusReply,
  CastExhibitionRequest,
  CastExhibitionReply,
  CastListArtworkRequest,
  CastListArtworkReply,
  NextArtworkRequest,
  NextArtworkReply,
  PauseCastingRequest,
  PauseCastingReply,
  ResumeCastingRequest,
  ResumeCastingReply,
  PreviousArtworkRequest,
  PreviousArtworkReply,
  MoveToArtworkRequest,
  MoveToArtworkReply,
  UpdateDurationRequest,
  UpdateDurationReply,
  RotateRequest,
  RotateReply,
  TapGestureRequest,
  GestureReply,
  DragGestureRequest,
  GetCursorOffsetRequest,
  GetCursorOffsetReply,
  SetCursorOffsetRequest,
  SetCursorOffsetReply,
  KeyboardEventRequest,
  KeyboardEventReply,
  CastInfo,
  DeviceInfoV2,
} from '../utils/types';

import { LocalStorageItem } from '@/constants';

class CanvasService {
  private castInfo: CastInfo | null = null;
  private clientDeviceInfo: DeviceInfoV2 | null = null;
  private timer: unknown = null;

  public getCastInfo() {
    return this.castInfo;
  }

  public setCastInfo(castInfo: CastInfo | null) {
    this.castInfo = castInfo;
    localStorage.setItem(
      LocalStorageItem.castInfo,
      JSON.stringify(this.castInfo)
    );
  }

  public async processMessage(event: MessageEvent) {
    console.log('processMessage', JSON.stringify(event));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const webSocketMessage = JSON.parse(event.data) as WebSocketMessage | null;
    if (!webSocketMessage) {
      console.error('Invalid message:', JSON.stringify(event.data));
      return;
    }

    if (!webSocketMessage.message) {
      console.error('Invalid message:', JSON.stringify(event.data));
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const messageData = JSON.parse(webSocketMessage.message as string);

    if (
      webSocketMessage.messageID.startsWith('system') ||
      webSocketMessage.messageID === 'ping'
    ) {
      // Handle system messages or ping-pong messages
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const commandStr = messageData.command;
    if (!commandStr) {
      console.error(
        'Command not found in the message:',
        JSON.stringify(messageData)
      );
      return;
    }

    const command = CastCommand[commandStr as keyof typeof CastCommand];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const requestJson = messageData.request;

    console.log(`Received command: ${JSON.stringify(commandStr)}`);

    const reply = await this.commandHandler(command, requestJson);

    const responseMessage: WebSocketMessage = {
      messageID: webSocketMessage.messageID,
      message: reply,
    };

    return responseMessage;
  }

  private async commandHandler(
    command: CastCommand,
    requestJson: unknown
  ): Promise<Reply> {
    if (this.castInfo) {
      this.castInfo = {
        ...this.castInfo,
        castCommand: command,
      };
    } else {
      this.castInfo = {
        castCommand: command,
      };
    }

    switch (command) {
      case CastCommand.connect:
        return this.connect(requestJson as ConnectRequestV2);
      case CastCommand.disconnect:
        return this.disconnect(requestJson);
      case CastCommand.checkStatus:
        return this.status(requestJson as CheckDeviceStatusRequest);
      case CastCommand.castListArtwork:
        return this.castListArtwork(requestJson as CastListArtworkRequest);
      // case CastCommand.cancelCasting:
      //   return this.cancelCasting(requestJson);
      // case CastCommand.appendArtworkToCastingList:
      //   return this.appendListArtwork(requestJson);
      case CastCommand.pauseCasting:
        return this.pauseCasting(requestJson as PauseCastingRequest);
      case CastCommand.resumeCasting:
        return this.resumeCasting(requestJson as ResumeCastingRequest);
      case CastCommand.nextArtwork:
        return this.nextArtwork(requestJson as NextArtworkRequest);
      case CastCommand.previousArtwork:
        return this.previousArtwork(requestJson as PreviousArtworkRequest);
      case CastCommand.moveToArtwork:
        return this.moveToArtwork(requestJson as MoveToArtworkRequest);
      case CastCommand.updateDuration:
        return this.updateDuration(requestJson as UpdateDurationRequest);
      case CastCommand.castExhibition:
        return this.castExhibition(requestJson as CastExhibitionRequest);
      case CastCommand.rotate:
        return this.rotate(requestJson as RotateRequest);
      case CastCommand.tapGesture:
        return this.tapGesture(requestJson as TapGestureRequest);
      case CastCommand.dragGesture:
        return this.dragGesture(requestJson as DragGestureRequest);
      case CastCommand.setCursorOffset:
        return this.setCursorOffset(requestJson as SetCursorOffsetRequest);
      case CastCommand.getCursorOffset:
        return this.getCursorOffset(requestJson as GetCursorOffsetRequest);
      case CastCommand.sendKeyboardEvent:
        return this.keyboardEvent(requestJson as KeyboardEventRequest);
      case CastCommand.castDaily:
        return this.castDaily(requestJson as object);
      default:
        console.error(`Unknown command: ${command}`);
        return { ok: false };
    }
  }

  private async connect(request: ConnectRequestV2): Promise<ConnectReplyV2> {
    console.log('connect', JSON.stringify(request));

    const deviceInfo = await DeviceManager.getDeviceInfo(); // Get the website’s device info

    if (!deviceInfo) {
      console.error('Device info is not available');
      return { ok: false };
    }

    this.clientDeviceInfo = request.clientDevice;
    this.setCastInfo({
      artworks: [],
      deviceInfo: this.clientDeviceInfo,
      startTime: Date.now(),
    });
    console.log('_connected device:', JSON.stringify(this.clientDeviceInfo));
    return { ok: true };
  }

  public disconnect(request: unknown): Promise<DisconnectReplyV2> {
    console.log('disconnect', JSON.stringify(request));
    this.onDisconnect();
    return Promise.resolve({ ok: true });
  }

  private status(
    request: CheckDeviceStatusRequest
  ): Promise<CheckDeviceStatusReply> {
    console.log('checkStatus', JSON.stringify(request));
    return Promise.resolve({
      ok: true,
      startTime: Date.now(),
      artworks: this.castInfo?.artworks ?? [],
      connectedDevice: this.castInfo?.deviceInfo,
      exhibitionId: this.castInfo?.exhibitionId,
      displayKey: this.castInfo?.displayKey,
    });
  }

  private castExhibition(
    request: CastExhibitionRequest
  ): Promise<CastExhibitionReply> {
    if (!request.exhibitionId) {
      console.error('Exhibition ID is required');
      return Promise.resolve({ ok: false });
    }

    this.castInfo = {
      ...this.castInfo,
      exhibitionId: request.exhibitionId,
      catalogId: request.catalogId,
      catalog: request.catalog,
    };
    return Promise.resolve({ ok: true });
  }

  private castListArtwork(
    request: CastListArtworkRequest
  ): Promise<CastListArtworkReply> {
    console.log('castListArtwork', JSON.stringify(request));
    this.setCastInfo({
      ...this.castInfo,
      artworks: request.artworks,
      startTime: request.startTime ?? Date.now(),
    });
    return Promise.resolve({ ok: true });
  }

  private castDaily(request: object): Promise<Reply> {
    console.log('castDaily', request);
    this.setCastInfo({
      ...this.castInfo,
      displayKey: 'daily_work',
    });

    return Promise.resolve({ ok: true });
  }

  private nextArtwork(request: NextArtworkRequest): Promise<NextArtworkReply> {
    console.log('nextArtwork', request);
    return Promise.resolve({ ok: true });
  }

  private pauseCasting(
    request: PauseCastingRequest
  ): Promise<PauseCastingReply> {
    console.log('pauseCasting', request);
    return Promise.resolve({ ok: true });
  }

  private resumeCasting(
    request: ResumeCastingRequest
  ): Promise<ResumeCastingReply> {
    console.log('resumeCasting', request);
    return Promise.resolve({ ok: true });
  }

  private previousArtwork(
    request: PreviousArtworkRequest
  ): Promise<PreviousArtworkReply> {
    console.log('previousArtwork', request);
    return Promise.resolve({ ok: true });
  }

  private moveToArtwork(
    request: MoveToArtworkRequest
  ): Promise<MoveToArtworkReply> {
    console.log('moveToArtwork', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.artwork.token.id,
    });
    return Promise.resolve({ ok: true });
  }

  private updateDuration(
    request: UpdateDurationRequest
  ): Promise<UpdateDurationReply> {
    console.log('updateDuration', request);
    this.setCastInfo({
      ...this.castInfo,
      artworks: request.artworks,
    });

    return Promise.resolve({
      ok: true,
      startTime: Date.now(),
      artworks: request.artworks,
    });
  }

  private rotate(request: RotateRequest): Promise<RotateReply> {
    console.log('rotate', request);
    return Promise.resolve({ ok: true, degree: 0 });
  }

  private async tapGesture(request: TapGestureRequest): Promise<GestureReply> {
    console.log('tapGesture', request);
    return Promise.resolve({ ok: true });
  }

  private dragGesture(request: DragGestureRequest): Promise<GestureReply> {
    console.log('dragGesture', request);
    return Promise.resolve({ ok: true });
  }

  private getCursorOffset(
    request: GetCursorOffsetRequest
  ): Promise<GetCursorOffsetReply> {
    console.log('getCursorOffset', request);
    return Promise.resolve({
      ok: true,
      cursorOffset: { dx: 0, dy: 0, coefficientX: 1, coefficientY: 1 },
    });
  }

  private setCursorOffset(
    request: SetCursorOffsetRequest
  ): Promise<SetCursorOffsetReply> {
    console.log('setCursorOffset', request);
    return Promise.resolve({ ok: true });
  }

  private keyboardEvent(
    request: KeyboardEventRequest
  ): Promise<KeyboardEventReply> {
    console.log('keyboardEvent', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.code,
    });
    return Promise.resolve({ ok: true });
  }

  private onDisconnect() {
    console.log('onDisconnect');
    this.setCastInfo(null);
  }

  // private setTimer(state: unknown, onNext: Function | null) {
  //   console.log('setTimer', state);
  //   this.cancelTimer();
  //   if (state.artworks.length <= 1) {
  //     return;
  //   }
  //   const currentArtwork = state.currentArtwork;
  //   const castingIndex = state.castingIndex;
  //   const artworkStartTime = state.artworkLastStartTime(castingIndex);
  //   const remainingDuration =
  //     currentArtwork.duration - (Date.now() - artworkStartTime);
  //   if (remainingDuration <= 0) return;
  //   console.log('setTimer: remainingDuration', remainingDuration);
  //   this.timer = setTimeout(() => {
  //     if (onNext) onNext();
  //   }, remainingDuration - 1000);
  // }

  // private cancelTimer() {
  //   if (this.timer) {
  //     clearTimeout(this.timer);
  //     this.timer = null;
  //   }
  // }
}

export default CanvasService;
