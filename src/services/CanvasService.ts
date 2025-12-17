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
  DisplaySettings,
  ViewMode,
} from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import {
  CursorPositionListener,
  CursorPosition,
} from './custom-hooks/useCursorPositions';
import { LocalStorageItem, NO_DURATION_VALUE } from '@/constants';
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
import { DP1Service } from './DP1Service';

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
    CanvasService.instance ??= new CanvasService();
    return CanvasService.instance;
  }

  public getCastInfo() {
    console.log('[CanvasService] Retrieving castInfo');
    return this.castInfo;
  }

  public setCastInfo(castInfo: CastInfo | null, notify = true) {
    console.log('[CanvasService] Setting castInfo:', notify);
    this.castInfo = castInfo;
    if (notify) {
      this.onCastInfoChange?.(this.castInfo);
    }
  }

  public executeScheduledDP1Task(dp1CallData: DP1Call): void {
    console.log('[CanvasService] Executing scheduled DP1 task with data');
    this.nowDisplayPlaylist({ dp1CallData });
  }

  public async castPlaylistByURL(playlistURL: string): Promise<void> {
    try {
      console.log('[CanvasService] Fetching playlist from:', playlistURL);
      const defaultPlaylist = await DP1Service.getPlaylist(playlistURL);

      if (!defaultPlaylist) {
        return;
      }

      console.log('[CanvasService] Default playlist fetched, casting...');

      // Build the message data structure for displayPlaylist command
      const messageData = {
        command: CastCommand.displayPlaylist,
        request: {
          intent: {
            action: DP1Action.NowDisplay,
          },
          dp1_call: defaultPlaylist,
          playlistUrl: playlistURL,
        },
      };

      // Simulate processMessage with the built message data
      console.log('[CanvasService] Processing default playlist message');
      const reply = canvasService.processMessage(messageData);

      if (reply?.ok) {
        console.log('[CanvasService] Default playlist cast successfully');
      } else {
        console.error(
          '[CanvasService] Failed to cast default playlist:',
          JSON.stringify(reply)
        );
      }
    } catch (error) {
      console.error('[CanvasService] Error in castPlaylistByURL:', error);
    }
  }

  public processMessage(
    messageData: Record<string, unknown>
  ): Reply | undefined {
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
    const reply = this.commandHandler(command, requestJson);
    return reply;
  }

  private commandHandler(command: CastCommand, requestJson: unknown): Reply {
    console.log('[CAST] commandHandler:', JSON.stringify(command));
    try {
      if (command === CastCommand.displayPlaylist) {
        DeviceManager.removeItem(LocalStorageItem.criticalTemp).catch(
          (error: unknown) => {
            console.error(
              '[CanvasService] Error removing criticalTemp:',
              error
            );
          }
        );
      }

      switch (command) {
        case CastCommand.connect:
          return this.connect();
        case CastCommand.disconnect:
          return this.disconnect();
        case CastCommand.checkStatus:
          return this.getStatus();
        case CastCommand.displayPlaylist:
          return this.displayPlaylist(requestJson as DisplayPlaylistRequest);
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

    try {
      const criticalTempValue = DeviceManager.getCachedItem(
        LocalStorageItem.criticalTemp
      );
      const isOverheating = criticalTempValue === 'true';

      if (isOverheating) {
        return { ok: false, error: ErrorType.Overheating };
      }

      const storedCastInfo = DeviceManager.getCachedCastInfo();
      if (!this.castInfo && storedCastInfo) {
        // Ensure in-memory state is available for future status calls
        this.setCastInfo(storedCastInfo, false);
      }

      const activeCastInfo = this.castInfo ?? storedCastInfo ?? null;
      return {
        ok: true,
        castCommand: activeCastInfo?.castCommand,

        playlist: activeCastInfo?.playlist,
        playlistUrl: activeCastInfo?.playlistUrl,

        items: activeCastInfo?.playlist?.items,
        index: activeCastInfo?.index,
        isPaused: activeCastInfo?.isPaused,

        deviceSettings: {
          scaling:
            DeviceManager.getCachedDeviceDisplaySettings()?.scaling ??
            DisplaySettings.defaultScaling,
          orientation: DeviceManager.getCachedViewMode() ?? ViewMode.landscape,
        },
      };
    } catch (error) {
      console.error('[CanvasService] Error getting status:', error);
      return { ok: false, error: ErrorType.StatusCheckFailed };
    }
  }

  private connect(): ConnectReplyV2 {
    this.setCastInfo({
      ...(this.castInfo ?? {}),
      castCommand: CastCommand.connect,
    });

    console.log('[CAST] Connected device');
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

      case DP1Action.DisplayAtBoot: {
        reply = this.nowDisplayPlaylist({
          dp1CallData,
          playlistUrl,
        });

        DeviceManager.setBootPlaylist(dp1CallData).catch((error: unknown) => {
          console.error('[CanvasService] Error setting boot playlist:', error);
        });
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

    console.log('[CanvasService] Display playlist');
    this.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      playlist: {
        ...request.dp1CallData,
        items: request.dp1CallData.items.map(item => ({
          ...item,
          duration: item.duration ?? NO_DURATION_VALUE,
        })),
      },
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

    console.log('[CanvasService] Schedule playlist');
    DP1ScheduleService.storeScheduledTask(
      request.dp1CallData,
      request.scheduleTime.replace('Z', '')
    ).catch((error: unknown) => {
      console.error('[CanvasService] Error storing scheduled task:', error);
    });

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
