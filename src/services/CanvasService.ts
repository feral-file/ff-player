/* eslint-disable max-lines -- CanvasService is still the shared playback hub;
keep the loop-mode patch local rather than splitting the class in this change. */
import {
  Reply,
  CheckDeviceStatusReply,
  NowDisplayRequest,
  NowDisplayReply,
  SchedulePlaylistRequest,
  SchedulePlaylistReply,
  UpdateDefaultDurationRequest,
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
  DisplayDefaultPlaylistRequest,
  DisplayDefaultPlaylistReply,
} from '@/models';
import { stripLegacyCastPlaybackTimeline } from '@/utils/castInfo';
import { LoopMode } from '@/models/cast_info.model';
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
  normalizePlaylistIndex,
  resolveItemIndexInNewItems,
} from '@/utils/playlist';
import { coerceLoopMode } from '@/utils/loopMode';
import { deepEqual } from '@/utils/helper';
import { DP1Service } from './DP1Service';

/**
 * Owns the in-browser FF1 playback session state that cast commands and route
 * components share, including playlist order, loop/shuffle modes, and deferred
 * refresh transitions.
 */
class CanvasService {
  private castInfo: CastInfo | null = null;
  private static instance: CanvasService | null;
  private originalPlaylistItems: DP1Item[] | null = null;
  private queuedPlaylistPending = false;
  private pendingRefreshArtwork = false;
  // Refresh payload deferred because the currently playing item is absent from
  // the new list. Kept private so getStatus never exposes staging state.
  private deferredRefreshPlaylist: DP1Call | null = null;
  public onCastInfoChange: ((castInfo: CastInfo | null) => void) | null = null;
  /**
   * Playlist route registers a cache-bust reload for the active artwork.
   * Return true when the reload was applied; false means the sender should retry.
   */
  private _onRefreshArtwork: (() => boolean) | null = null;

  public get onRefreshArtwork(): (() => boolean) | null {
    return this._onRefreshArtwork;
  }

  public set onRefreshArtwork(handler: (() => boolean) | null) {
    this._onRefreshArtwork = handler;
    this.flushPendingRefreshArtwork();
  }

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
    if (castInfo === null) {
      this.queuedPlaylistPending = false;
      this.setDeferredRefreshPlaylist(null);
      this.pendingRefreshArtwork = false;
    }
    this.castInfo =
      castInfo === null ? null : stripLegacyCastPlaybackTimeline(castInfo);
    if (notify) {
      this.onCastInfoChange?.(this.castInfo);
    }
  }

  public hasQueuedPlaylistPending(): boolean {
    return this.queuedPlaylistPending;
  }

  public clearQueuedPlaylistPending() {
    this.queuedPlaylistPending = false;
  }

  private setDeferredRefreshPlaylist(next: DP1Call | null) {
    this.deferredRefreshPlaylist = next;
  }

  private flushPendingRefreshArtwork() {
    if (!this.pendingRefreshArtwork || !this._onRefreshArtwork) {
      return;
    }

    const applied = this._onRefreshArtwork();
    if (applied) {
      this.pendingRefreshArtwork = false;
      return;
    }

    console.warn(
      '[CanvasService] refreshArtwork: handler could not update preview URL'
    );
  }

  /**
   * Called by the player when it is about to apply the queued playlist (i.e.
   * The current item just ended and the new list should start). Atomically
   * promotes the deferred refresh onto castInfo so getStatus reflects the new
   * playlist from the first frame of the new item.
   *
   * Returns the new playlist if there was a pending deferred refresh, or null
   * if nothing was deferred (normal case — no special handling needed).
   */
  public hasDeferredRefreshPlaylist(): boolean {
    return this.deferredRefreshPlaylist !== null;
  }

  /**
   * Returns the items the player should apply when advancing past the current
   * artwork. For a deferred refresh (current item absent from new list) this is
   * the new list stored privately; for an immediate refresh or shuffle it is the
   * current castInfo.playlist.items (already updated on castInfo).
   */
  public getQueuedPlaylistItems(): DP1Item[] | null {
    const deferred = this.deferredRefreshPlaylist?.items;
    if (deferred?.length) {
      return deferred;
    }
    return this.castInfo?.playlist?.items ?? null;
  }

  public consumeDeferredRefreshPlaylist(nextIndex: number): DP1Call | null {
    const pending = this.deferredRefreshPlaylist;
    if (!pending) {
      return null;
    }
    this.queuedPlaylistPending = false;
    this.setDeferredRefreshPlaylist(null);
    this.setCastInfo({
      ...(this.castInfo ?? {}),
      playlist: pending,
      index: nextIndex,
      castCommand: CastCommand.updateIndex,
    });
    return pending;
  }

  /**
   * Publishes a slot-index transition from the playlist route. Drops the
   * update when castInfo is absent or already reports this index under
   * updateIndex — collapsing same-tick races where the duration timer and a
   * source-end event both try to publish the same advance.
   */
  public publishIndexUpdate(index: number): void {
    const currentCastInfo = this.castInfo;
    if (!currentCastInfo) {
      return;
    }
    if (
      currentCastInfo.castCommand === CastCommand.updateIndex &&
      currentCastInfo.index === index
    ) {
      return;
    }

    this.setCastInfo({
      ...currentCastInfo,
      castCommand: CastCommand.updateIndex,
      index,
    });
  }

  public executeScheduledDP1Task(dp1CallData: DP1Call): void {
    console.log('[CanvasService] Executing scheduled DP1 task with data');
    this.nowDisplayPlaylist({ dp1CallData });
  }

  /**
   * Fetch the playlist at `playlistURL` and cast it as the current display.
   *
   * Returns true only when the playlist was fetched AND the displayPlaylist
   * message was accepted. Returns false (never throws) on a fetch failure, an
   * empty playlist, or a rejected message — callers own the retry policy. The
   * boot fallback in AppContext depends on this signal: the player can load
   * with no connectivity at all (SoftAP first-time setup boots the kiosk
   * straight into the player), so a swallowed failure here used to strand a
   * freshly-paired device with no default playlist.
   */
  public async castPlaylistByURL(playlistURL: string): Promise<boolean> {
    try {
      console.log('[CanvasService] Fetching playlist from:', playlistURL);
      const defaultPlaylist = await DP1Service.getPlaylist(playlistURL);

      if (!defaultPlaylist) {
        return false;
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
        return true;
      }
      console.error(
        '[CanvasService] Failed to cast default playlist:',
        JSON.stringify(reply)
      );
      return false;
    } catch (error) {
      console.error('[CanvasService] Error in castPlaylistByURL:', error);
      return false;
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
        case CastCommand.refreshArtwork:
          return this.refreshArtwork();
        case CastCommand.setSleepMode:
          return this.setSleepMode(requestJson as SetSleepModeRequest);
        case CastCommand.setShuffle:
          return this.setShuffle(requestJson as SetShuffleRequest);
        case CastCommand.setLoop:
          return this.setLoop(requestJson as SetLoopRequest);
        case CastCommand.displayDefaultPlaylist:
          return this.displayDefaultPlaylist(
            requestJson as DisplayDefaultPlaylistRequest
          );
        case CastCommand.updateDefaultDuration:
          return this.updateDefaultDuration(
            requestJson as UpdateDefaultDurationRequest
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
        castCommand: DeviceManager.getCachedCastInfo()?.castCommand,

        playlist: activeCastInfo?.playlist,
        playlistUrl: activeCastInfo?.playlistUrl,

        items: activeCastInfo?.playlist?.items,
        index: activeCastInfo?.index,

        deviceSettings: {
          scaling:
            DeviceManager.getCachedDeviceDisplaySettings()?.scaling ??
            DisplaySettings.defaultScaling,
          orientation: DeviceManager.getCachedViewMode() ?? ViewMode.landscape,
          defaultDuration:
            DeviceManager.getCachedDefaultItemDurationSeconds() ?? undefined,
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
    const path = request.sleepMode ? '/sleep' : '/playlist';

    if (typeof window !== 'undefined') {
      if (!request.sleepMode) {
        this.setCastInfo({
          ...this.castInfo,
          castCommand: CastCommand.displayPlaylist,
        });
      }
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

    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.moveToArtwork,
      index: request.index,
    });
    return { ok: true };
  }

  private refreshArtwork(): Reply {
    const activeCastInfo = this.castInfo;
    if (!activeCastInfo?.playlist?.items?.length) {
      console.error('[CanvasService] No active artwork to refresh');
      return { ok: false };
    }

    if (!this._onRefreshArtwork) {
      this.pendingRefreshArtwork = true;
      console.warn(
        '[CanvasService] refreshArtwork: no playlist handler registered'
      );
      return { ok: false };
    }
    const applied = this._onRefreshArtwork();
    if (!applied) {
      console.warn(
        '[CanvasService] refreshArtwork: handler could not update preview URL'
      );
      return { ok: false };
    }
    this.pendingRefreshArtwork = false;
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
      return this.refreshPlaylist(dp1CallData.items);
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

    // Clear any stored original playlist from a previous shuffle session and any
    // deferred refresh waiting to be applied — a fresh display supersedes both.
    this.originalPlaylistItems = null;
    this.queuedPlaylistPending = false;
    this.setDeferredRefreshPlaylist(null);

    console.log('[CanvasService] Display playlist');
    // Each Now Display starts a new cast session surface: do not inherit prior
    // shuffle / loop toggles from the previous playlist on the same device tab.
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
      index: 0,
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
    const currentIndex = normalizePlaylistIndex(
      this.castInfo.index ?? 0,
      currentItems.length
    );
    const currentItem = currentItems[currentIndex];

    if (enabled) {
      this.originalPlaylistItems ??= [...currentItems];
      // Shuffle everything except the current item, keep it at position 0
      const remaining = currentItems.filter((_, i) => i !== currentIndex);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      this.queuedPlaylistPending = true;
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
      this.queuedPlaylistPending = true;
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

  /**
   * Sets (or clears, with null/absent durationSeconds) the persisted
   * device-level default item duration — the viewer's "each work displays
   * this long" override (DP-1 §4.1 device-level overrides). The value is
   * cached synchronously before the IndexedDB write settles, then castInfo is
   * republished so the playlist route re-arms the active slot timer against
   * the new value without restarting playback.
   */
  private updateDefaultDuration(
    request: UpdateDefaultDurationRequest | undefined
  ): Reply {
    // A missing request envelope means "clear" — same as an explicit null.
    const raw = request?.durationSeconds ?? null;
    if (raw !== null && (!Number.isFinite(raw) || raw <= 0)) {
      console.error('[CanvasService] Invalid default duration:', raw);
      return { ok: false };
    }

    console.log('[CanvasService] updateDefaultDuration', raw);
    DeviceManager.setDefaultItemDurationSeconds(raw).catch(
      (error: unknown) => {
        console.error(
          '[CanvasService] Error persisting default duration:',
          error
        );
      }
    );

    if (this.castInfo) {
      this.setCastInfo({
        ...this.castInfo,
        castCommand: CastCommand.updateDefaultDuration,
      });
    }

    return { ok: true };
  }

  private setLoop(request: SetLoopRequest): Reply {
    const rawMode = (request as unknown as { mode: string }).mode;
    const mode = coerceLoopMode(rawMode);

    console.log('[CanvasService] setLoop', mode);
    this.setCastInfo({
      ...this.castInfo,
      castCommand: CastCommand.setLoop,
      loopMode: mode,
    });

    return { ok: true };
  }

  // Keep deferred-refresh, shuffle restoration, and index remapping together
  // because they all amend the same compatibility-sensitive cast contract.
  // eslint-disable-next-line max-lines-per-function
  private refreshPlaylist(newItems: DP1Item[] | undefined): Reply {
    const currentPlaylist = this.castInfo?.playlist;
    const prior = this.castInfo;
    if (!currentPlaylist?.items?.length) {
      console.error(
        '[CanvasService] Cannot refresh playlist before an active playlist exists'
      );
      return { ok: false };
    }

    // Normalize durations like nowDisplay; index is remapped by id so getStatus
    // matches the artwork still playing until the player applies the queued list.
    // Refresh only replaces playlist items. Keep the current playlist metadata
    // and defaults untouched so the remote intent stays narrowly scoped.
    const comparisonItems =
      prior?.shuffle && this.originalPlaylistItems?.length
        ? this.originalPlaylistItems
        : currentPlaylist.items;
    const currentNormalizedItems = comparisonItems.map(dp1Item => ({
      ...dp1Item,
      duration: dp1Item.duration ?? NO_DURATION_VALUE,
    }));
    const normalizedItems = (newItems ?? []).map(dp1Item => ({
      ...dp1Item,
      duration: dp1Item.duration ?? NO_DURATION_VALUE,
    }));
    if (deepEqual(currentNormalizedItems, normalizedItems)) {
      // A refresh that matches the canonical unshuffled list during an active
      // shuffle session must not tear down the queued shuffled state or force
      // the player back to the unshuffled order.
      if (!(prior?.shuffle && this.originalPlaylistItems?.length)) {
        this.queuedPlaylistPending = false;
        this.setDeferredRefreshPlaylist(null);
      }
      console.log(
        '[CanvasService] New playlist is the same as the current playlist'
      );
      return { ok: true };
    }

    console.log('newPlaylist', normalizedItems.length);

    if (!prior) {
      console.error(
        '[CanvasService] Cannot refresh playlist without active cast info'
      );
      return { ok: false };
    }
    if (prior.shuffle) {
      // While shuffle is active, keep the unshuffled snapshot aligned with the
      // latest refresh payload so toggling shuffle off restores the refreshed
      // playlist instead of an older pre-refresh order.
      this.originalPlaylistItems = [...normalizedItems];
    }
    const prevItems = currentPlaylist.items;
    const prevIndex = prior.index;
    const playlistForRefresh = {
      ...currentPlaylist,
      items: normalizedItems,
    };

    let currentItemId: string | undefined;
    if (prevItems.length && prevIndex !== undefined) {
      const at = normalizePlaylistIndex(prevIndex, prevItems.length);
      currentItemId = prevItems[at].id;
    }

    const stillInNew =
      currentItemId !== undefined &&
      normalizedItems.some(item => item.id === currentItemId);

    // Current artwork is absent from the new list: keep playlist + index so
    // getStatus still describes what is on screen. Defer the new list privately
    // until the player calls consumeDeferredRefreshPlaylist() after the item ends.
    if (
      prevItems.length &&
      normalizedItems.length &&
      currentItemId !== undefined &&
      !stillInNew
    ) {
      this.queuedPlaylistPending = true;
      this.setDeferredRefreshPlaylist(playlistForRefresh);
      this.setCastInfo({
        ...prior,
        castCommand: CastCommand.refreshPlaylist,
      });
      return { ok: true };
    }

    this.queuedPlaylistPending = normalizedItems.length > 0;
    this.setDeferredRefreshPlaylist(null);

    const index = resolveItemIndexInNewItems(
      normalizedItems,
      prevItems,
      prevIndex
    );

    this.setCastInfo({
      ...prior,
      playlist: playlistForRefresh,
      castCommand: CastCommand.refreshPlaylist,
      index,
    });
    return { ok: true };
  }

  /**
   * Delegates to AppContext's fallback-playlist loop instead of resolving
   * `defaultPlaylistURL` here. This handler and the boot fallback previously
   * fetched remote config through two separate RemoteConfigService instances,
   * which could disagree (an offline boot caches the hardcoded fallback URL
   * while this handler's fresh fetch returns the published one), so a
   * controld-pushed default playlist could differ from the one the player
   * pulls on its own. One dispatch path means one playlist source, and the
   * loop's retry/backoff covers transient fetch failures for free.
   *
   * The `onlyIfNoPlaylist` flag gives callers "make sure something is
   * playing" semantics: if a playlist is already on screen (for example when
   * the boot fallback recovered before feral-controld's first-pair push
   * arrived), the request is a no-op instead of stomping playback. OOM
   * recovery omits the flag on purpose — it wants the default to replace
   * possibly-OOM-causing content.
   */
  private displayDefaultPlaylist(
    request?: DisplayDefaultPlaylistRequest
  ): DisplayDefaultPlaylistReply {
    if (request?.onlyIfNoPlaylist && this.castInfo?.playlist?.items?.length) {
      console.log(
        '[CanvasService] Playlist already displaying, skipping default playlist'
      );
      return { ok: true };
    }

    window.dispatchEvent(
      new CustomEvent(CustomEventName.DisplayDefaultPlaylist as string)
    );
    return { ok: true };
  }
}

export const canvasService = CanvasService.getInstance();
