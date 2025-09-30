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
  UpdateArtFramingRequest,
  UpdateCursorPositionsRequest,
  UpdateDisplaySettingsRequest,
  UpdateCursorPositionsReply,
  TokenDisplaySettings,
  DisplayPlaylistRequest,
  DisplayPlaylistReply,
  ArtFraming,
  MoveToArtworkRequest as MoveToItemRequest,
  MoveToArtworkReply as MoveToItemReply,
} from '@/models';
import DeviceManager from '@/utils/DeviceManager';
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
import DP1ScheduleService from './DP1ScheduleService';
import { calculateStartTime } from '@/utils/playlist';
import { deepEqual } from '@/utils/helper';

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

  private commandHandler(command: CastCommand, requestJson: unknown): Reply {
    console.log(
      '[CAST] commandHandler:',
      JSON.stringify(command),
      JSON.stringify(requestJson)
    );
    try {
      if (
        [
          CastCommand.castDaily,
          CastCommand.castExhibition,
          CastCommand.displayPlaylist,
        ].includes(command)
      ) {
        localStorage.removeItem(LocalStorageItem.criticalTemp);
      }

      switch (command) {
        case CastCommand.connect:
          return this.connect(requestJson as ConnectRequestV2);
        case CastCommand.disconnect:
          return this.disconnect();
        case CastCommand.checkStatus:
          return this.getStatus();
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
        case CastCommand.displayPlaylist:
          return this.displayPlaylist(requestJson as DisplayPlaylistRequest);
        case CastCommand.moveToArtwork:
          return this.moveToArtwork(requestJson as MoveToItemRequest);
        default:
          console.error(`[CAST] Unknown command: ${command}`);
          return { ok: false };
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

    return {
      ok: true,
      castCommand: DeviceManager.getCastInfo()?.castCommand,

      playlist: this.castInfo?.playlist,
      playlistUrl: this.castInfo?.playlistUrl,

      items: this.castInfo?.playlist?.items,
      index: this.castInfo?.index,
      isPaused: this.castInfo?.isPaused,
    };
  }

  public castDaily(request: object): Reply {
    console.log('[CanvasService] Cast daily: ', request);

    this.setCastInfo({
      castCommand: CastCommand.castDaily,
      deviceInfo: this.castInfo?.deviceInfo,
    });
    return { ok: true };
  }

  private connect(request: ConnectRequestV2): ConnectReplyV2 {
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

  // ---------------------------- Playlist controller ----------------------------
  private moveToArtwork(request: MoveToItemRequest): MoveToItemReply {
    console.log('[CanvasService] move to item', request.index);
    if (request.index < 0) {
      return { ok: false };
    }

    const startTime = calculateStartTime(
      this.castInfo?.playlist?.items ?? [],
      request.index
    );

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.moveToArtwork,
      isPaused: false,
      startTime,
      index: request.index,
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

  // Settings
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

  // DP1 Handlers

  private displayPlaylist(
    request: DisplayPlaylistRequest
  ): DisplayPlaylistReply {
    const dp1Intent = request.intent;
    const dp1CallData = request.dp1_call;
    const playlistUrl = request.playlistUrl;
    const action = dp1Intent?.action;

    console.log('[CanvasService] display playlist: ', action);
    Sentry.addBreadcrumb({
      data: { action },
      category: 'CanvasService',
      message: 'Received DP1 command',
    });

    if (request.refresh) {
      this.refreshPlaylist(dp1CallData);
      return { ok: true };
    }

    let reply: Reply;
    switch (action) {
      case DP1Action.NowDisplay: {
        return this.nowDisplayPlaylist({
          dp1CallData,
          playlistUrl,
        });
      }

      case DP1Action.SchedulePlay: {
        return this.schedulePlaylist({
          dp1CallData,
          scheduleTime: dp1Intent?.schedule_time,
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

  private nowDisplayPlaylist(request: NowDisplayRequest): NowDisplayReply {
    if (!request.dp1CallData.items?.length) {
      console.error('[CanvasService] No items to display');
      return { ok: false };
    }

    console.log('[CanvasService] Display playlist: ', JSON.stringify(request));
    this.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      deviceInfo: this.castInfo?.deviceInfo,
      playlist: request.dp1CallData,
      playlistUrl: request.playlistUrl,
      startTime: Date.now(),
      index: 0,
      isPaused: false,
      playlistId: request.dp1CallData.id,
    });
    return { ok: true };
  }

  private schedulePlaylist(
    request: SchedulePlaylistRequest
  ): SchedulePlaylistReply {
    if (!request.dp1CallData.items?.length) {
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
    DP1ScheduleService.storeScheduledTask(
      request.dp1CallData,
      request.scheduleTime.replace('Z', '')
    );

    return { ok: true };
  }

  private refreshPlaylist(newPlaylist: DP1Call) {
    const currentPlaylist = this.castInfo?.playlist;
    if (currentPlaylist && deepEqual(currentPlaylist, newPlaylist)) {
      console.log(
        '[CanvasService] New playlist is the same as the current playlist'
      );
      return;
    }

    console.log('newPlaylist', newPlaylist.items?.length);

    this.setCastInfo({
      ...(this.castInfo ?? {}),
      playlist: newPlaylist,
      castCommand: CastCommand.refreshPlaylist,
    });
  }
}

export const canvasService = CanvasService.getInstance();
