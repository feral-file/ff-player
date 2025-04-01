import { calculateStartTime, getArtworkStartTime } from '@/utils/Playlist';
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
  UpdateArtFramingRequest,
  UpdateDisplaySettingsRequest,
  PlayArtworkV2,
  ArtFraming,
} from '../utils/types';
import { TokenDisplaySettings } from '@/models/display_settings.model';
import * as Sentry from '@sentry/nextjs';

class CanvasService {
  private castInfo: CastInfo | null = null;
  private static instance: CanvasService | null;
  public onCastInfoChange: ((castInfo: CastInfo | null) => void) | null = null;

  private displaySettingsChangedListeners: ((
    isFromArtist: boolean,
    displaySettings: TokenDisplaySettings
  ) => void)[] = [];

  public addDisplaySettingsChangedListener(
    callback: (
      isFromArtist: boolean,
      displaySettings: TokenDisplaySettings
    ) => void
  ) {
    this.displaySettingsChangedListeners.push(callback);
  }

  public removeDisplaySettingsChangedListener(
    callback: (
      isFromArtist: boolean,
      displaySettings: TokenDisplaySettings
    ) => void
  ) {
    this.displaySettingsChangedListeners =
      this.displaySettingsChangedListeners.filter(
        listener => listener !== callback
      );
  }

  private notifyDisplaySettingsChanged(
    isFromArtist: boolean,
    displaySettings: TokenDisplaySettings
  ) {
    this.displaySettingsChangedListeners.forEach(listener => {
      try {
        listener(isFromArtist, displaySettings);
      } catch (error) {
        console.error('Error in display settings listener:', error);
      }
    });
  }

  public static getInstance() {
    if (!CanvasService.instance) {
      CanvasService.instance = new CanvasService();
    }
    return CanvasService.instance;
  }

  public getCastInfo() {
    console.log(
      '[CanvasService] Retrieving castInfo:',
      JSON.stringify(this.castInfo)
    );
    return this.castInfo;
  }

  public setCastInfo(castInfo: CastInfo | null, notify = true) {
    console.log('[CanvasService] Setting castInfo:', JSON.stringify(castInfo));
    this.castInfo = castInfo;
    if (notify) {
      this.onCastInfoChange?.(this.castInfo);
    }
  }

  public async processMessage(event: MessageEvent) {
    console.log(
      '[CanvasService] Processing message event: ',
      JSON.stringify(event)
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const webSocketMessage = JSON.parse(event.data) as WebSocketMessage | null;
    if (!webSocketMessage) {
      console.error('[CAST] Invalid message:', JSON.stringify(event.data));
      return;
    }
    console.log(
      '[CAST] WebSocket message received:',
      JSON.stringify(webSocketMessage)
    );

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

    Sentry.addBreadcrumb({
      data: { command },
      category: 'CanvasService',
      message: 'Received command',
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const requestJson = messageData.request;
    console.log('[CanvasService] Request data:', JSON.stringify(requestJson));

    const reply = await this.commandHandler(command, requestJson);

    const responseMessage: WebSocketMessage = {
      messageID: webSocketMessage.messageID,
      message: reply,
    };
    console.log(
      '[CanvasService] Response message:',
      JSON.stringify(responseMessage)
    );

    return responseMessage;
  }

  private async commandHandler(
    command: CastCommand,
    requestJson: unknown
  ): Promise<Reply> {
    console.log(
      '[CAST] commandHandler:',
      JSON.stringify(command),
      JSON.stringify(requestJson)
    );
    try {
      switch (command) {
        case CastCommand.ping:
          return { ok: true };
        case CastCommand.connect:
          return await this.connect(requestJson as ConnectRequestV2);
        case CastCommand.disconnect:
          return await this.disconnect(requestJson);
        case CastCommand.checkStatus:
          return await this.status(requestJson as CheckDeviceStatusRequest);
        case CastCommand.castListArtwork:
          return await this.castListArtwork(
            requestJson as CastListArtworkRequest
          );
        // case CastCommand.cancelCasting:
        //   return this.cancelCasting(requestJson);
        // case CastCommand.appendArtworkToCastingList:
        //   return this.appendListArtwork(requestJson);
        case CastCommand.pauseCasting:
          return await this.pauseCasting(requestJson as PauseCastingRequest);
        case CastCommand.resumeCasting:
          return await this.resumeCasting(requestJson as ResumeCastingRequest);
        case CastCommand.nextArtwork:
          return await this.nextArtwork(requestJson as NextArtworkRequest);
        case CastCommand.previousArtwork:
          return await this.previousArtwork(
            requestJson as PreviousArtworkRequest
          );
        case CastCommand.moveToArtwork:
          return await this.moveToArtwork(requestJson as MoveToArtworkRequest);
        case CastCommand.updateDuration:
          return await this.updateDuration(
            requestJson as UpdateDurationRequest
          );
        case CastCommand.castExhibition:
          return await this.castExhibition(
            requestJson as CastExhibitionRequest
          );
        case CastCommand.rotate:
          return await this.rotate(requestJson as RotateRequest);
        case CastCommand.tapGesture:
          return await this.tapGesture(requestJson as TapGestureRequest);
        case CastCommand.dragGesture:
          return await this.dragGesture(requestJson as DragGestureRequest);
        case CastCommand.setCursorOffset:
          return await this.setCursorOffset(
            requestJson as SetCursorOffsetRequest
          );
        case CastCommand.getCursorOffset:
          return await this.getCursorOffset(
            requestJson as GetCursorOffsetRequest
          );
        case CastCommand.sendKeyboardEvent:
          return await this.keyboardEvent(requestJson as KeyboardEventRequest);
        case CastCommand.castDaily:
          return await this.castDaily(requestJson as object);
        case CastCommand.updateArtFraming:
          return await this.updateArtFraming(
            requestJson as UpdateArtFramingRequest
          );
        case CastCommand.updateDisplaySettings:
          return await this.updateDisplaySettings(
            requestJson as UpdateDisplaySettingsRequest
          );
        default:
          console.error(`[CAST] Unknown command: ${command}`);
          return { ok: false };
      }
    } catch (error) {
      console.error('[CAST] Error handling command:', error);
      return { ok: false };
    }
  }

  private connect(request: ConnectRequestV2): Promise<ConnectReplyV2> {
    console.log('[CanvasService] Connect request:', JSON.stringify(request));

    this.setCastInfo({
      ...(this.castInfo ?? {}),
      castCommand: CastCommand.connect,
      deviceInfo: request.clientDevice,
    });

    console.log(
      '[CAST] Connected device:',
      JSON.stringify(request.clientDevice)
    );
    return Promise.resolve({ ok: true });
  }

  public async disconnect(request: unknown): Promise<DisconnectReplyV2> {
    console.log('[CanvasService] Disconnect: ', JSON.stringify(request));
    this.setCastInfo(null);
    return Promise.resolve({ ok: true });
  }

  private status(
    request: CheckDeviceStatusRequest
  ): Promise<CheckDeviceStatusReply> {
    console.log('[CanvasService] Check status:', JSON.stringify(request));
    return Promise.resolve({
      ok: true,
      connectedDevice: this.castInfo?.deviceInfo,

      exhibitionId: this.castInfo?.exhibitionId,
      catalog: this.castInfo?.catalog,
      catalogId: this.castInfo?.catalogId,

      artworks: this.castInfo?.artworks ?? [],
      startTime: this.castInfo?.startTime,
      index: this.castInfo?.index,
      isPaused: this.castInfo?.isPaused,

      displayKey: this.castInfo?.displayKey,
    });
  }

  private castExhibition(
    request: CastExhibitionRequest
  ): Promise<CastExhibitionReply> {
    if (!request.exhibitionId) {
      console.error('[CAST] Exhibition ID is required');
      return Promise.resolve({ ok: false });
    }

    console.log('[CanvasService] Cast exhibition: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.castExhibition,
      deviceInfo: this.castInfo?.deviceInfo,
      exhibitionId: request.exhibitionId,
      catalogId: request.catalogId,
      catalog: request.catalog,
    });

    return Promise.resolve({ ok: true });
  }

  private castListArtwork(
    request: CastListArtworkRequest
  ): Promise<CastListArtworkReply> {
    console.log('[CanvasService] Cast list artwork: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.castListArtwork,
      deviceInfo: this.castInfo?.deviceInfo,
      artworks: request.artworks,
      startTime: request.startTime ?? Date.now(),
      index: 0,
      isPaused: false,
    });
    return Promise.resolve({ ok: true });
  }

  public castDaily(request: object): Promise<Reply> {
    console.log('[CanvasService] Cast daily: ', request);

    this.setCastInfo({
      castCommand: CastCommand.castDaily,
      deviceInfo: this.castInfo?.deviceInfo,
      displayKey: 'daily_work',
    });
    return Promise.resolve({ ok: true });
  }

  // ---------------------------- Playlist controls ----------------------------

  private pauseCasting(
    request: PauseCastingRequest
  ): Promise<PauseCastingReply> {
    console.log('[CanvasService]: pause casting', request);

    const now = Date.now();
    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.artworks ?? [];
    const startPlayArtworkTime = getArtworkStartTime(
      playlist,
      currentIndex,
      this.castInfo?.startTime ?? Date.now()
    );
    const elapsedTime = now - startPlayArtworkTime;
    const remainTime = playlist[currentIndex].duration - elapsedTime;

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.pauseCasting,
      isPaused: true,
      elapsedTime,
      remainTime,
    });
    return Promise.resolve({ ok: true });
  }

  private resumeCasting(
    request: ResumeCastingRequest
  ): Promise<ResumeCastingReply> {
    console.log('[CanvasService] resume casting:', request);

    const startTime = calculateStartTime(
      this.castInfo?.artworks ?? [],
      this.castInfo?.index ?? 0,
      this.castInfo?.elapsedTime
        ? new Date(this.castInfo.elapsedTime).setMilliseconds(0)
        : undefined
    );

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.resumeCasting,
      isPaused: false,
      startTime,
    });
    return Promise.resolve({ ok: true });
  }

  private nextArtwork(request: NextArtworkRequest): Promise<NextArtworkReply> {
    console.log('[CanvasService] next artwork: ', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.artworks ?? [];

    const index = (currentIndex + 1) % playlist.length;
    const startTime = calculateStartTime(playlist, index);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.nextArtwork,
      isPaused: false,
      startTime,
      index,
    });
    return Promise.resolve({ ok: true });
  }

  private previousArtwork(
    request: PreviousArtworkRequest
  ): Promise<PreviousArtworkReply> {
    console.log('[CanvasService] previous artwork', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.artworks ?? [];

    let index: number;
    if (currentIndex === 0) {
      index = playlist.length - 1;
    } else {
      index = (currentIndex - 1) % playlist.length;
    }

    const startTime = calculateStartTime(playlist, index);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.previousArtwork,
      isPaused: false,
      startTime,
      index,
    });
    return Promise.resolve({ ok: true });
  }

  private moveToArtwork(
    request: MoveToArtworkRequest
  ): Promise<MoveToArtworkReply> {
    console.log('[CanvasService] move to artwork', request);

    const tokenID = this.castInfo?.value;
    if (!tokenID) {
      return Promise.resolve({ ok: false });
    }

    const playlist = this.castInfo?.artworks ?? [];
    const index = playlist.findIndex(
      (p: PlayArtworkV2) => p.token?.id === tokenID
    );
    if (index < 0) {
      return Promise.resolve({ ok: false });
    }

    const startTime = calculateStartTime(playlist, index);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.moveToArtwork,
      isPaused: false,
      value: request.artwork.token.id,
      startTime,
      index,
    });
    return Promise.resolve({ ok: true });
  }

  private updateDuration(
    request: UpdateDurationRequest
  ): Promise<UpdateDurationReply> {
    console.log('[CanvasService] update duration', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = request.artworks;
    const startTime = calculateStartTime(playlist, currentIndex);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.updateDuration,
      artworks: request.artworks,
      startTime,
    });

    return Promise.resolve({
      ok: true,
      startTime: Date.now(),
      artworks: request.artworks,
    });
  }

  // ---------------------------- End Playlist controls ----------------------------

  private rotate(request: RotateRequest): Promise<RotateReply> {
    console.log('[CanvasService] rotate:', request);
    return Promise.resolve({ ok: true, degree: 0 });
  }

  private async tapGesture(request: TapGestureRequest): Promise<GestureReply> {
    console.log('[CanvasService] tapGesture: ', request);
    return Promise.resolve({ ok: true });
  }

  private dragGesture(request: DragGestureRequest): Promise<GestureReply> {
    console.log('[CanvasService] dragGesture: ', request);
    return Promise.resolve({ ok: true });
  }

  private getCursorOffset(
    request: GetCursorOffsetRequest
  ): Promise<GetCursorOffsetReply> {
    console.log('[CanvasService] getCursorOffset: ', request);
    return Promise.resolve({
      ok: true,
      cursorOffset: { dx: 0, dy: 0, coefficientX: 1, coefficientY: 1 },
    });
  }

  private setCursorOffset(
    request: SetCursorOffsetRequest
  ): Promise<SetCursorOffsetReply> {
    console.log('[CanvasService] setCursorOffset: ', request);
    return Promise.resolve({ ok: true });
  }

  private keyboardEvent(
    request: KeyboardEventRequest
  ): Promise<KeyboardEventReply> {
    console.log('[CanvasService] keyboardEvent: ', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.code,
    });
    return Promise.resolve({ ok: true });
  }

  public updateArtFraming(request: UpdateArtFramingRequest): Promise<Reply> {
    console.log('Update ArtFraming: ', JSON.stringify(request));

    this.notifyDisplaySettingsChanged(false, {
      scaling: Object.values(ArtFraming)[request.frameConfig],
    });

    return Promise.resolve({ ok: true });
  }

  public updateDisplaySettings(
    request: UpdateDisplaySettingsRequest
  ): Promise<Reply> {
    console.log(
      '[CanvasService] updateDisplaySettings: ',
      JSON.stringify(request)
    );

    this.notifyDisplaySettingsChanged(request.fromArtist ?? false, request);
    return Promise.resolve({ ok: true });
  }
}

export default CanvasService;
