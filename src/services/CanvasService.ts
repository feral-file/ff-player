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
  SetSleepModeRequest,
  SetSleepModeReply,
  SetShuffleRequest,
  SetLoopRequest,
  DisplayDefaultPlaylistReply,
} from '@/models';
import { coerceLoopMode, LoopMode } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';
import { CustomEventName, NavigateEventDetail } from '@/models/custom_event';
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
import {
  calculateStartTime,
  reanchorStartTimeForNoneToPlaylist,
  reanchorStartTimeForPlaylistToNone,
} from '@/utils/playlist';
import { deepEqual } from '@/utils/helper';
import { DP1Service } from './DP1Service';
import RemoteConfigService from './remoteConfigService';

class CanvasService {
  private castInfo: CastInfo | null = null;
  private static instance: CanvasService | null;
  private originalPlaylistItems: DP1Item[] | null = null;
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
      if (
        command === CastCommand.displayPlaylist ||
        command === CastCommand.displayDefaultPlaylist
      ) {
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
        case CastCommand.setSleepMode:
          return this.setSleepMode(requestJson as SetSleepModeRequest);
        case CastCommand.setShuffle:
          return this.setShuffle(requestJson as SetShuffleRequest);
        case CastCommand.setLoop:
          return this.setLoop(requestJson as SetLoopRequest);
        case CastCommand.displayDefaultPlaylist:
          return this.displayDefaultPlaylist();
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

      console.log(
        '[CanvasService getStatus] Reply ok. Current index:',
        activeCastInfo?.index ?? 'N/A'
      );

      return {
        ok: true,
        castCommand: activeCastInfo?.castCommand,

        playlist: activeCastInfo?.playlist,
        playlistUrl: activeCastInfo?.playlistUrl,

        items: activeCastInfo?.playlist?.items,
        index: activeCastInfo?.index,

        deviceSettings: {
          scaling:
            DeviceManager.getCachedDeviceDisplaySettings()?.scaling ??
            DisplaySettings.defaultScaling,
          orientation: DeviceManager.getCachedViewMode() ?? ViewMode.landscape,
        },

        isPaused: window.location.pathname === '/sleep',
        sleepMode: window.location.pathname === '/sleep',

        loopMode: coerceLoopMode(activeCastInfo?.loopMode),
        shuffle: activeCastInfo?.shuffle ?? false,
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

  public setSleepMode(request: SetSleepModeRequest): SetSleepModeReply {
    console.log('[CanvasService] Set sleep mode', request.sleepMode);
    const path = request.sleepMode ? '/sleep' : '/';

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<NavigateEventDetail>(
          CustomEventName.Navigate as string,
          {
            detail: { path },
          }
        )
      );
    }

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

    // Clear any stored original playlist from a previous shuffle session
    this.originalPlaylistItems = null;

    console.log('[CanvasService] Display playlist');
    // New playlist session: reset repeat/shuffle so prior cast state does not carry over.
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
      loopMode: LoopMode.playlist,
      shuffle: false,
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

  private setShuffle(request: SetShuffleRequest): Reply {
    const currentItems = this.castInfo?.playlist?.items;
    if (!currentItems?.length || !this.castInfo?.playlist) {
      console.error('[CanvasService] No playlist to shuffle');
      return { ok: false };
    }

    const enabled = (request as unknown as { enabled: boolean }).enabled;

    // Identify the currently playing item so it can be anchored in the new order
    const currentIndex = this.castInfo.index ?? 0;
    const currentRealIndex = currentIndex % currentItems.length;
    const currentItem = currentItems[currentRealIndex];

    if (enabled) {
      this.originalPlaylistItems ??= [...currentItems];
      // Shuffle everything except the current item, keep it at position 0
      const remaining = currentItems.filter((_, i) => i !== currentRealIndex);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      this.setCastInfo({
        ...this.castInfo,
        castCommand: CastCommand.setShuffle,
        shuffle: true,
        index: 0,
        playlist: {
          ...this.castInfo.playlist,
          items: [currentItem, ...remaining],
        },
      });
    } else {
      const restored = this.originalPlaylistItems ?? currentItems;
      this.originalPlaylistItems = null;
      // Find the current item's position in the restored original order
      const newIndex = Math.max(
        0,
        restored.findIndex(item => item.id === currentItem.id)
      );
      this.setCastInfo({
        ...this.castInfo,
        castCommand: CastCommand.setShuffle,
        shuffle: false,
        index: newIndex,
        playlist: { ...this.castInfo.playlist, items: restored },
      });
    }

    return { ok: true };
  }

  private setLoop(request: SetLoopRequest): Reply {
    const rawMode = (request as unknown as { mode: string }).mode;
    const mode = coerceLoopMode(rawMode);
    const prev = coerceLoopMode(this.castInfo?.loopMode as string | undefined);

    let startTime = this.castInfo?.startTime;
    const items = this.castInfo?.playlist?.items;
    const totalMs =
      items?.reduce((acc, item) => acc + (item.duration ?? 0) * 1000, 0) ?? 0;

    if (items?.length && startTime !== undefined && totalMs > 0) {
      // Re-anchor from wall clock only. Cast-level pause/resume is not wired from the FF
      // app today; timeline helpers assume playback time tracks Date.now() - startTime.
      // When pause is supported end-to-end, revisit: frozen offset from remainTime /
      // elapsedTime, or defer re-anchor until resume (TBD).
      const now = Date.now();

      if (mode === LoopMode.playlist && prev === LoopMode.none) {
        const anchored = reanchorStartTimeForNoneToPlaylist(
          items,
          startTime,
          now
        );
        if (anchored !== null) {
          startTime = anchored;
        }
      }

      if (mode === LoopMode.none && prev === LoopMode.playlist) {
        startTime = reanchorStartTimeForPlaylistToNone(startTime, now, totalMs);
      }
    }

    console.log('[CanvasService] setLoop', mode);
    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.setLoop,
      loopMode: mode,
      ...(startTime !== undefined ? { startTime } : {}),
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

  private displayDefaultPlaylist(): DisplayDefaultPlaylistReply {
    new RemoteConfigService()
      .getAppRemoteConfig()
      .then(config => this.castPlaylistByURL(config.defaultPlaylistURL))
      .catch((error: unknown) => {
        console.error(
          '[CanvasService] Error displaying default playlist:',
          error
        );
        return { ok: false };
      });
    return { ok: true };
  }
}

export const canvasService = CanvasService.getInstance();
