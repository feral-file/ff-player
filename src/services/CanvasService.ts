import { calculateStartTime, getArtworkStartTime } from '@/utils/playlist';
import {
  Reply,
  ConnectRequestV2,
  ConnectReplyV2,
  DisconnectReplyV2,
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
  TapGestureRequest,
  GestureReply,
  DragGestureRequest,
  GetCursorOffsetRequest,
  GetCursorOffsetReply,
  SetCursorOffsetRequest,
  SetCursorOffsetReply,
  KeyboardEventRequest,
  KeyboardEventReply,
  UpdateArtFramingRequest,
  UpdateDisplaySettingsRequest,
  PlayArtwork,
} from '@/models/cast_request_reply.model';
import { TokenDisplaySettings } from '@/models/display_settings.model';
import * as Sentry from '@sentry/nextjs';
import {
  ArtFraming,
  CastCommand,
  CastInfo,
  UpdateCursorPositionsReply,
  UpdateCursorPositionsRequest,
  DisplaySettings,
  ViewMode,
} from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import {
  CursorPositionListener,
  CursorPosition,
} from './custom-hooks/useCursorPositions';
import { LocalStorageItem } from '@/constants';
import { ErrorType } from '@/models/error.model';
import { DP1, DP1Action, DP1Item } from '@/models/dp1.model';
import DP1ScheduleService from './DP1ScheduleService';

class CanvasService {
  private castInfo: CastInfo | null = null;
  private static instance: CanvasService | null;
  public onCastInfoChange: ((castInfo: CastInfo | null) => void) | null = null;

  // Cursor positions
  private cursorPositionsListeners: CursorPositionListener[] = [];
  private currentCursorPositions: CursorPosition[] = [];

  public addCursorPositionsListener(callback: CursorPositionListener) {
    this.cursorPositionsListeners.push(callback);
    if (this.currentCursorPositions.length > 0) {
      callback(this.currentCursorPositions);
    }
  }

  public removeCursorPositionsListener(callback: CursorPositionListener) {
    this.cursorPositionsListeners = this.cursorPositionsListeners.filter(
      listener => listener !== callback
    );
  }

  private notifyCursorPositionsChanged(positions: CursorPosition[]) {
    this.currentCursorPositions = positions;
    this.cursorPositionsListeners.forEach(listener => {
      try {
        listener(positions);
      } catch (error) {
        console.error(
          '[CanvasService] Error in cursor positions listener:',
          error
        );
      }
    });
  }
  // End cursor positions Service Update Listener

  // Display settings
  private displaySettingsChangedListeners: ((
    isSaveToDevice: boolean,
    displaySettings: TokenDisplaySettings
  ) => void)[] = [];

  public addDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: TokenDisplaySettings
    ) => void
  ) {
    this.displaySettingsChangedListeners.push(callback);
  }

  public removeDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: TokenDisplaySettings
    ) => void
  ) {
    this.displaySettingsChangedListeners =
      this.displaySettingsChangedListeners.filter(
        listener => listener !== callback
      );
  }

  private notifyDisplaySettingsChanged(
    isSaveToDevice: boolean,
    displaySettings: TokenDisplaySettings
  ) {
    this.displaySettingsChangedListeners.forEach(listener => {
      try {
        listener(isSaveToDevice, displaySettings);
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

  public processMessage(messageData: Record<string, unknown>) {
    console.log(
      '[CanvasService] Processing message: ',
      JSON.stringify(messageData)
    );

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

    const requestJson = messageData.request;
    console.log('[CanvasService] Request data:', JSON.stringify(requestJson));
    const reply = this.commandHandler(command, requestJson);
    console.log('[CanvasService] Response message:', JSON.stringify(reply));
    return reply;
  }

  public processDP1Message(dp1Message: DP1) {
    const dp1Intent = dp1Message.intent;
    const dp1Call = dp1Message.dp1_call;
    const action = dp1Intent.action;

    console.log('[CanvasService] Processing DP1 message: ', action);
    Sentry.addBreadcrumb({
      data: { action },
      category: 'CanvasService',
      message: 'Received DP1 command',
    });

    switch (action) {
      case DP1Action.NowDisplay: {
        const reply = this.castListArtwork({ items: dp1Call.items });
        console.log('[CanvasService] Response message:', JSON.stringify(reply));
        return reply;
      }

      case DP1Action.SchedulePlay: {
        DP1ScheduleService.getInstance().storeScheduledTask(dp1Message);
        return { ok: true };
      }

      case DP1Action.GetCurrentPlaylist: {
        return this.status();
      }

      default:
        return { ok: false };
    }
  }

  private commandHandler(command: CastCommand, requestJson: unknown): Reply {
    console.log(
      '[CAST] commandHandler:',
      JSON.stringify(command),
      JSON.stringify(requestJson)
    );
    try {
      switch (command) {
        case CastCommand.connect:
          return this.connect(requestJson as ConnectRequestV2);
        case CastCommand.disconnect:
          return this.disconnect();
        case CastCommand.checkStatus:
          return this.status();
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
        case CastCommand.updateArtFraming:
          return this.updateArtFraming(requestJson as UpdateArtFramingRequest);
        case CastCommand.updateDisplaySettings:
          return this.updateDisplaySettings(
            requestJson as UpdateDisplaySettingsRequest
          );
        case CastCommand.cursorUpdate:
          return this.updateCursorPositions(
            requestJson as UpdateCursorPositionsRequest
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

  private connect(request: ConnectRequestV2): ConnectReplyV2 {
    console.log('[CanvasService] Connect request:', JSON.stringify(request));

    this.setCastInfo({
      ...(this.castInfo ?? {}),
      castCommand: CastCommand.connect,
      deviceInfo: request.clientDevice,
    });

    DeviceManager.setPrimaryAddress(request.primaryAddress ?? '');

    console.log(
      '[CAST] Connected device:',
      JSON.stringify(request.clientDevice)
    );
    return { ok: true };
  }

  public disconnect(): DisconnectReplyV2 {
    console.log('[CanvasService] Disconnect');
    this.setCastInfo(null);
    return { ok: true };
  }

  private status(): CheckDeviceStatusReply {
    console.log('[CanvasService] Check status');

    const isOverheating =
      localStorage.getItem(LocalStorageItem.criticalTemp) === 'true';

    if (isOverheating) {
      return { ok: false, error: ErrorType.Overheating };
    }

    const deviceSettings = DeviceManager.getDeviceDisplaySettings();
    return {
      ok: true,
      connectedDevice: this.castInfo?.deviceInfo,

      exhibitionId: this.castInfo?.exhibitionId,
      catalog: this.castInfo?.catalog,
      catalogId: this.castInfo?.catalogId,

      artworks: this.castInfo?.artworks ?? [],
      index: this.castInfo?.index,
      isPaused: this.castInfo?.isPaused,

      displayKey: this.castInfo?.displayKey,

      deviceSettings: {
        scaling: deviceSettings?.scaling ?? DisplaySettings.defaultScaling,
        orientation: DeviceManager.getViewMode() ?? ViewMode.landscape,
      },

      items: this.castInfo?.items,
    };
  }

  private castExhibition(request: CastExhibitionRequest): CastExhibitionReply {
    if (!request.exhibitionId) {
      console.error('[CAST] Exhibition ID is required');
      return { ok: false };
    }

    console.log('[CanvasService] Cast exhibition: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.castExhibition,
      deviceInfo: this.castInfo?.deviceInfo,
      exhibitionId: request.exhibitionId,
      catalogId: request.catalogId,
      catalog: request.catalog,
    });

    return { ok: true };
  }

  private castListArtwork(
    request: CastListArtworkRequest
  ): CastListArtworkReply {
    console.log('[CanvasService] Cast list artwork: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.castListArtwork,
      deviceInfo: this.castInfo?.deviceInfo,
      items: request.items,
      startTime: Date.now(),
      index: 0,
      isPaused: false,
    });
    return { ok: true };
  }

  public castDaily(request: object): Reply {
    console.log('[CanvasService] Cast daily: ', request);

    this.setCastInfo({
      castCommand: CastCommand.castDaily,
      deviceInfo: this.castInfo?.deviceInfo,
      displayKey: 'daily_work',
    });
    return { ok: true };
  }

  // ---------------------------- Playlist controls ----------------------------

  private pauseCasting(request: PauseCastingRequest): PauseCastingReply {
    console.log('[CanvasService]: pause casting', request);

    const now = Date.now();
    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.items ?? [];
    const startPlayArtworkTime = getArtworkStartTime(
      playlist,
      currentIndex,
      this.castInfo?.startTime ?? Date.now()
    );
    const elapsedTime = now - startPlayArtworkTime;
    const remainTime = playlist[currentIndex].duration * 1000 - elapsedTime;

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.pauseCasting,
      isPaused: true,
      elapsedTime,
      remainTime,
    });
    return { ok: true };
  }

  private resumeCasting(request: ResumeCastingRequest): ResumeCastingReply {
    console.log('[CanvasService] resume casting:', request);

    const startTime = calculateStartTime(
      this.castInfo?.items ?? [],
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
    return { ok: true };
  }

  private nextArtwork(request: NextArtworkRequest): NextArtworkReply {
    console.log('[CanvasService] next artwork: ', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.items ?? [];

    const index = (currentIndex + 1) % playlist.length;
    const startTime = calculateStartTime(playlist, index);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.nextArtwork,
      isPaused: false,
      startTime,
      index,
    });
    return { ok: true };
  }

  private previousArtwork(
    request: PreviousArtworkRequest
  ): PreviousArtworkReply {
    console.log('[CanvasService] previous artwork', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.items ?? [];

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
    return { ok: true };
  }

  private moveToArtwork(request: MoveToArtworkRequest): MoveToArtworkReply {
    console.log('[CanvasService] move to artwork', request);

    const tokenID = this.castInfo?.value;
    if (!tokenID) {
      return { ok: false };
    }

    const playlist = this.castInfo?.items ?? [];
    const index = playlist.findIndex(
      (p: PlayArtwork) => p.token?.id === tokenID
    );
    if (index < 0) {
      return { ok: false };
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
    return { ok: true };
  }

  private updateDuration(request: UpdateDurationRequest): UpdateDurationReply {
    console.log('[CanvasService] update duration', request);

    const currentIndex = this.castInfo?.index ?? 0;
    const playlist = this.castInfo?.items ?? [];
    const startTime = calculateStartTime(playlist, currentIndex);

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.updateDuration,
      artworks: request.artworks,
      startTime,
    });

    return {
      ok: true,
      startTime: Date.now(),
      artworks: request.artworks,
    };
  }

  // ---------------------------- End Playlist controls ----------------------------

  public updateCursorPositions(
    request: UpdateCursorPositionsRequest
  ): UpdateCursorPositionsReply {
    console.log('[CanvasService] updateCursorPositions: ', request);

    if (request.positions.length > 0) {
      this.notifyCursorPositionsChanged(request.positions);
    }

    return { ok: true };
  }

  private tapGesture(request: TapGestureRequest): GestureReply {
    console.log('[CanvasService] tapGesture: ', request);
    return { ok: true };
  }

  private dragGesture(request: DragGestureRequest): GestureReply {
    console.log('[CanvasService] dragGesture: ', request);
    return { ok: true };
  }

  private getCursorOffset(
    request: GetCursorOffsetRequest
  ): GetCursorOffsetReply {
    console.log('[CanvasService] getCursorOffset: ', request);
    return {
      ok: true,
      cursorOffset: { dx: 0, dy: 0, coefficientX: 1, coefficientY: 1 },
    };
  }

  private setCursorOffset(
    request: SetCursorOffsetRequest
  ): SetCursorOffsetReply {
    console.log('[CanvasService] setCursorOffset: ', request);
    return { ok: true };
  }

  private keyboardEvent(request: KeyboardEventRequest): KeyboardEventReply {
    console.log('[CanvasService] keyboardEvent: ', request);
    this.setCastInfo({
      ...this.castInfo,
      value: request.code,
    });
    return { ok: true };
  }

  public updateArtFraming(request: UpdateArtFramingRequest): Reply {
    console.log('Update ArtFraming: ', JSON.stringify(request));

    this.notifyDisplaySettingsChanged(true, {
      scaling: Object.values(ArtFraming)[request.frameConfig],
    });

    return { ok: true };
  }

  public updateDisplaySettings(request: UpdateDisplaySettingsRequest): Reply {
    console.log(
      '[CanvasService] updateDisplaySettings: ',
      JSON.stringify(request)
    );

    this.notifyDisplaySettingsChanged(request.isSaved, request);
    return { ok: true };
  }

  public executeScheduledDP1Task(items: DP1Item[]): void {
    console.log(
      '[CanvasService] Executing scheduled DP1 task with items:',
      items
    );
    this.castListArtwork({ items });
  }
}

export default CanvasService;
