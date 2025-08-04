import {
  Reply,
  CheckDeviceStatusReply,
  NowDisplayRequest,
  NowDisplayReply,
  SchedulePlaylistRequest,
  SchedulePlaylistReply,
} from '@/models/cast_request_reply.model';
import * as Sentry from '@sentry/nextjs';
import {
  CastCommand,
  CastInfo,
  ConnectReplyV2,
  ConnectRequestV2,
  DisconnectReplyV2,
  DeviceDisplaySettings,
  ViewMode,
  UpdateArtFramingRequest,
  UpdateCursorPositionsRequest,
  UpdateDisplaySettingsRequest,
  UpdateCursorPositionsReply,
  DisplayPlaylistRequest,
  DisplayPlaylistReply,
  ArtFraming,
} from '@/models';
import { deviceManager } from '@/utils/DeviceManager';
import {
  CursorPositionListener,
  CursorPosition,
} from './custom-hooks/useCursorPositions';
import { LocalStorageItem } from '@/constants';
import { ErrorType } from '@/models/error.model';
import {
  DP1Action,
  DP1Call,
  DP1DisplayPreference,
  Scaling,
} from '@/models/dp1.model';
import { dp1ScheduleService } from './DP1ScheduleService';

export class CanvasService {
  private castInfo: CastInfo | null = null;
  private static _instance: CanvasService | undefined;
  public onCastInfoChange: ((castInfo: CastInfo | null) => void) | null = null;

  public static getInstance() {
    if (!CanvasService._instance) {
      CanvasService._instance = new CanvasService();
    }
    return CanvasService._instance;
  }

  // Cursor positions
  private cursorPositionsListeners: CursorPositionListener[] = [];
  private currentCursorPositions: CursorPosition[] = [];

  public resetCursorPositions() {
    this.currentCursorPositions = [];
  }

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

  public clearCursorPositionsListeners() {
    this.cursorPositionsListeners = [];
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
    displaySettings: DP1DisplayPreference
  ) => void)[] = [];

  public addDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.displaySettingsChangedListeners.push(callback);
  }

  public removeDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.displaySettingsChangedListeners =
      this.displaySettingsChangedListeners.filter(
        listener => listener !== callback
      );
  }

  public clearDisplaySettingsChangedListeners() {
    this.displaySettingsChangedListeners = [];
  }

  private notifyDisplaySettingsChanged(
    isSaveToDevice: boolean,
    displaySettings: DP1DisplayPreference
  ) {
    this.displaySettingsChangedListeners.forEach(listener => {
      try {
        listener(isSaveToDevice, displaySettings);
      } catch (error) {
        console.error('Error in display settings listener:', error);
      }
    });
  }
  // End display settings

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

  public executeScheduledDP1Task(dp1CallData: DP1Call): void {
    console.log(
      '[CanvasService] Executing scheduled DP1 task with data:',
      JSON.stringify(dp1CallData)
    );
    this.nowDisplayPlaylist({ dp1CallData });
  }

  public processMessage(messageData: Record<string, unknown>) {
    const commandStr = messageData.command;

    if (!commandStr) {
      console.error('[CAST] Command not found:', JSON.stringify(messageData));
      return { ok: false, error: ErrorType.CommandNotFound };
    }

    if (!Object.values(CastCommand).includes(commandStr as CastCommand)) {
      console.error('[CAST] Not supported command:', commandStr);
      return { ok: false, error: ErrorType.InvalidCommand };
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

  public commandHandler(command: CastCommand, requestJson: unknown): Reply {
    console.log('[CAST] commandHandler:', command, JSON.stringify(requestJson));
    try {
      switch (command) {
        case CastCommand.connect:
          return this.connect(requestJson as ConnectRequestV2);
        case CastCommand.disconnect:
          return this.disconnect();
        case CastCommand.checkStatus:
          return this.getStatus();
        case CastCommand.castDaily:
          return this.castDaily();
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
        case CastCommand.displayPlaylist:
          return this.displayPlaylist(requestJson as DisplayPlaylistRequest);
        default:
          console.error(`[CAST] Unknown command: ${command}`);
          return { ok: false, error: ErrorType.InvalidCommand };
      }
    } catch (error) {
      console.error('[CAST] Error handling command:', error);
      return { ok: false };
    }
  }

  public getStatus(): CheckDeviceStatusReply {
    console.log('[CanvasService] Check status');

    const isOverheating =
      localStorage.getItem(LocalStorageItem.criticalTemp) === 'true';

    if (isOverheating) {
      return { ok: false, error: ErrorType.Overheating };
    }

    const deviceSettings = deviceManager.getDeviceDisplaySettings();
    return {
      ok: true,
      index: this.castInfo?.index,
      isPaused: this.castInfo?.isPaused,

      displayKey: this.castInfo?.displayKey,

      deviceSettings: {
        scaling:
          deviceSettings?.scaling ?? DeviceDisplaySettings.defaultScaling,
        orientation: deviceManager.getViewMode() ?? ViewMode.landscape,
      },

      items: this.castInfo?.items,
    };
  }

  public connect(request: ConnectRequestV2): ConnectReplyV2 {
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
    return { ok: true };
  }

  public disconnect(): DisconnectReplyV2 {
    console.log('[CanvasService] Disconnect');
    this.setCastInfo(null);
    return { ok: true };
  }

  public castDaily(): Reply {
    console.log('[CanvasService] Cast daily');

    this.setCastInfo({
      castCommand: CastCommand.castDaily,
      deviceInfo: this.castInfo?.deviceInfo,
      displayKey: 'daily_work',
    });
    return { ok: true };
  }

  // ---------------------------- Interactions ----------------------------
  public updateCursorPositions(
    request: UpdateCursorPositionsRequest
  ): UpdateCursorPositionsReply {
    console.log('[CanvasService] updateCursorPositions: ', request);

    if (request.positions.length > 0) {
      this.notifyCursorPositionsChanged(request.positions);
    }

    return { ok: true };
  }

  // ---------------------------- Settings ----------------------------
  public updateArtFraming(request: UpdateArtFramingRequest): Reply {
    console.log('Update ArtFraming: ', JSON.stringify(request));

    const artFraming = Object.values(ArtFraming)[request.frameConfig];

    this.notifyDisplaySettingsChanged(true, {
      scaling:
        artFraming === ArtFraming.CropToFill ? Scaling.Fill : Scaling.Fit,
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

  // ---------------------------- DP1 ----------------------------
  public displayPlaylist(
    request: DisplayPlaylistRequest
  ): DisplayPlaylistReply {
    const dp1Intent = request.intent;
    const dp1CallData = request.dp1_call;
    const action = dp1Intent.action;

    console.log('[CanvasService] display playlist: ', action);
    Sentry.addBreadcrumb({
      data: { action },
      category: 'CanvasService',
      message: 'Received DP1 command',
    });

    let reply: Reply;
    switch (action) {
      case DP1Action.NowDisplay: {
        return this.nowDisplayPlaylist({ dp1CallData });
      }

      case DP1Action.SchedulePlay: {
        return this.schedulePlaylist({
          dp1CallData,
          scheduleTime: dp1Intent.schedule_time,
        });
      }

      case DP1Action.GetCurrentPlaylist: {
        reply = this.getStatus();
        break;
      }

      default: {
        console.error('[CanvasService] Unknown DP1 action:', action);
        reply = { ok: false };
        break;
      }
    }

    return reply;
  }

  public nowDisplayPlaylist(request: NowDisplayRequest): NowDisplayReply {
    if (!request.dp1CallData.items.length) {
      console.error('[CanvasService] No items to display');
      return { ok: false };
    }

    console.log('[CanvasService] Display playlist: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.castListArtwork,
      deviceInfo: this.castInfo?.deviceInfo,
      items: request.dp1CallData.items,
      startTime: Date.now(),
      index: 0,
      isPaused: false,
    });
    return { ok: true };
  }

  public schedulePlaylist(
    request: SchedulePlaylistRequest
  ): SchedulePlaylistReply {
    if (!request.dp1CallData.items.length) {
      console.error('[CanvasService] No items to schedule');
      return { ok: false };
    }

    if (!request.scheduleTime) {
      console.error('[CanvasService] No schedule time found');
      return { ok: false };
    }

    console.log(
      '[CanvasService] Schedule playlist: ',
      JSON.stringify({ request })
    );
    dp1ScheduleService.storeScheduledTask(
      request.dp1CallData,
      request.scheduleTime.replace('Z', '')
    );

    return { ok: true };
  }
}

export const canvasService = CanvasService.getInstance();
