import {
  Reply,
  CheckDeviceStatusReply,
  NowDisplayRequest,
  NowDisplayReply,
  SchedulePlaylistRequest,
  SchedulePlaylistReply,
} from '@/models/cast_request_reply.model';
import * as Sentry from '@sentry/nextjs';
import { CastCommand, CastInfo, DisplaySettings, ViewMode } from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import {
  CursorPositionListener,
  CursorPosition,
} from './custom-hooks/useCursorPositions';
import { LocalStorageItem } from '@/constants';
import { ErrorType } from '@/models/error.model';
import {
  DP1,
  DP1Action,
  DP1Call,
  DP1DisplayPreference,
} from '@/models/dp1.model';
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
  // End cursor positions Service Update Listener

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

  public processDP1Message(dp1Message: DP1) {
    const dp1Intent = dp1Message.intent;
    const dp1CallData = dp1Message.dp1_call;
    const action = dp1Intent.action;

    console.log('[CanvasService] Processing DP1 message: ', action);
    Sentry.addBreadcrumb({
      data: { action },
      category: 'CanvasService',
      message: 'Received DP1 command',
    });

    let reply: Reply;
    switch (action) {
      case DP1Action.NowDisplay: {
        return this.displayPlaylist({ dp1CallData });
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

    console.log('[CanvasService] DP1 reply:', JSON.stringify(reply));
    return reply;
  }

  private getStatus(): CheckDeviceStatusReply {
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

  public castDaily(request: object): Reply {
    console.log('[CanvasService] Cast daily: ', request);

    this.setCastInfo({
      castCommand: CastCommand.castDaily,
      deviceInfo: this.castInfo?.deviceInfo,
      displayKey: 'daily_work',
    });
    return { ok: true };
  }

  private displayPlaylist(request: NowDisplayRequest): NowDisplayReply {
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

  private schedulePlaylist(
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
    DP1ScheduleService.getInstance().storeScheduledTask(
      request.dp1CallData,
      request.scheduleTime.replace('Z', '')
    );

    return { ok: true };
  }

  public executeScheduledDP1Task(dp1CallData: DP1Call): void {
    console.log(
      '[CanvasService] Executing scheduled DP1 task with data:',
      JSON.stringify(dp1CallData)
    );
    this.displayPlaylist({ dp1CallData });
  }
}

export default CanvasService;
