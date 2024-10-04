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
  DeviceInfo,
} from '../utils/types';

import { LocalStorageItem } from '@/constants';

class CanvasService {
  private castInfo: CastInfo | null = null;
  private clientDeviceInfo: DeviceInfo | null = null;
  private timer: unknown = null;

  public getCastInfo() {
    return this.castInfo;
  }

  public setCastInfo(castInfo: CastInfo | null) {
    this.castInfo = castInfo;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    localStorage?.setItem(
      LocalStorageItem.castInfo,
      JSON.stringify(this.castInfo)
    );
  }

  public async processMessage(event: MessageEvent) {
    console.log('[CAST] processMessage: ', JSON.stringify(event));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const webSocketMessage = JSON.parse(event.data) as WebSocketMessage | null;
    if (!webSocketMessage) {
      console.error('[CAST] Invalid message:', JSON.stringify(event.data));
      return;
    }

    if (!webSocketMessage.message) {
      console.error('[CAST] Invalid message:', JSON.stringify(event.data));
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
        '[CAST] Command not found in the message:',
        JSON.stringify(messageData)
      );
      return;
    }

    const command = CastCommand[commandStr as keyof typeof CastCommand];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const requestJson = messageData.request;

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
    if (command !== CastCommand.checkStatus) {
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
        console.error(`[CAST] Unknown command: ${command}`);
        return { ok: false };
    }
  }

  private async connect(request: ConnectRequestV2): Promise<ConnectReplyV2> {
    console.log('[CAST] Connect request:', JSON.stringify(request));
    DeviceManager.setPrimaryAddress(request.primaryAddress ?? '');
    const deviceInfo = await DeviceManager.getDeviceInfo();
    if (!deviceInfo) {
      console.error('[CAST] Device info is not available on connect');
      return { ok: false };
    }

    this.clientDeviceInfo = request.clientDevice;
    this.setCastInfo({
      castCommand: CastCommand.connect,
      deviceInfo: this.clientDeviceInfo,
    });

    console.log(
      '[CAST] Connected device:',
      JSON.stringify(this.clientDeviceInfo)
    );
    return { ok: true };
  }

  public async disconnect(request: unknown): Promise<DisconnectReplyV2> {
    console.log('[CAST] Disconnect: ', JSON.stringify(request));
    this.setCastInfo(null);
    return Promise.resolve({ ok: true });
  }

  private status(
    request: CheckDeviceStatusRequest
  ): Promise<CheckDeviceStatusReply> {
    console.log('[CAST] Check status:', JSON.stringify(request));
    return Promise.resolve({
      ok: true,
      startTime: Date.now(),
      artworks: this.castInfo?.artworks ?? [],
      connectedDevice: this.castInfo?.deviceInfo,
      exhibitionId: this.castInfo?.exhibitionId,
      displayKey: this.castInfo?.displayKey,
      catalogId: this.castInfo?.catalogId,
    });
  }

  private castExhibition(
    request: CastExhibitionRequest
  ): Promise<CastExhibitionReply> {
    if (!request.exhibitionId) {
      console.error('[CAST] Exhibition ID is required');
      return Promise.resolve({ ok: false });
    }

    this.setCastInfo({
      ...this.castInfo,
      exhibitionId: request.exhibitionId,
      catalogId: request.catalogId,
      catalog: request.catalog,
    });
    return Promise.resolve({ ok: true });
  }

  private castListArtwork(
    request: CastListArtworkRequest
  ): Promise<CastListArtworkReply> {
    console.log('[CAST] list artwork: ', JSON.stringify(request));
    this.setCastInfo({
      ...this.castInfo,
      artworks: request.artworks,
      startTime: request.startTime ?? Date.now(),
    });
    return Promise.resolve({ ok: true });
  }

  private castDaily(request: object): Promise<Reply> {
    console.log('[CAST] daily: ', request);
    this.setCastInfo({
      ...this.castInfo,
      displayKey: 'daily_work',
    });

    return Promise.resolve({ ok: true });
  }

  private nextArtwork(request: NextArtworkRequest): Promise<NextArtworkReply> {
    console.log('[CAST] next artwork: ', request);
    return Promise.resolve({ ok: true });
  }

  private pauseCasting(
    request: PauseCastingRequest
  ): Promise<PauseCastingReply> {
    console.log('[CAST]: pause casting', request);
    return Promise.resolve({ ok: true });
  }

  private resumeCasting(
    request: ResumeCastingRequest
  ): Promise<ResumeCastingReply> {
    console.log('[CAST] resume casting:', request);
    return Promise.resolve({ ok: true });
  }

  private previousArtwork(
    request: PreviousArtworkRequest
  ): Promise<PreviousArtworkReply> {
    console.log('[CAST] previous artwork', request);
    return Promise.resolve({ ok: true });
  }

  private moveToArtwork(
    request: MoveToArtworkRequest
  ): Promise<MoveToArtworkReply> {
    console.log('[CAST] move to artwork', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.artwork.token.id,
    });
    return Promise.resolve({ ok: true });
  }

  private updateDuration(
    request: UpdateDurationRequest
  ): Promise<UpdateDurationReply> {
    console.log('[CAST] update duration', request);
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
    console.log('[CAST] rotate:', request);
    return Promise.resolve({ ok: true, degree: 0 });
  }

  private async tapGesture(request: TapGestureRequest): Promise<GestureReply> {
    console.log('[CAST] tapGesture: ', request);
    return Promise.resolve({ ok: true });
  }

  private dragGesture(request: DragGestureRequest): Promise<GestureReply> {
    console.log('[CAST] dragGesture: ', request);
    return Promise.resolve({ ok: true });
  }

  private getCursorOffset(
    request: GetCursorOffsetRequest
  ): Promise<GetCursorOffsetReply> {
    console.log('[CAST] getCursorOffset: ', request);
    return Promise.resolve({
      ok: true,
      cursorOffset: { dx: 0, dy: 0, coefficientX: 1, coefficientY: 1 },
    });
  }

  private setCursorOffset(
    request: SetCursorOffsetRequest
  ): Promise<SetCursorOffsetReply> {
    console.log('[CAST] setCursorOffset: ', request);
    return Promise.resolve({ ok: true });
  }

  private keyboardEvent(
    request: KeyboardEventRequest
  ): Promise<KeyboardEventReply> {
    console.log('[CAST] keyboardEvent: ', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.code,
    });
    return Promise.resolve({ ok: true });
  }
}

export default CanvasService;
