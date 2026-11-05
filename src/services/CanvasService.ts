import { LocalStorageItem } from '@/constants';
import {
  CastCommand,
  CastInfo,
  ConnectReplyV2,
  DisconnectReplyV2,
  DisplayDefaultPlaylistReply,
  DisplayDefaultPlaylistRequest,
  DisplayPlaylistReply,
  DisplayPlaylistRequest,
  MoveToArtworkReply as MoveToItemReply,
  MoveToArtworkRequest as MoveToItemRequest,
  RenderStatus,
  SetLoopRequest,
  SetShuffleRequest,
  SetSleepModeReply,
  SetSleepModeRequest,
  UpdateArtFramingRequest,
  UpdateCursorPositionsReply,
  UpdateCursorPositionsRequest,
  UpdateDisplaySettingsReply,
  UpdateDisplaySettingsRequest,
} from '@/models';
import {
  CheckDeviceStatusReply,
  Reply,
  UpdateDefaultDurationRequest,
} from '@/models/cast_request_reply.model';
import {
  DP1Action,
  DP1Call,
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import type {
  MediaHealthHint,
  PlaybackOutcomeInput,
} from '@/models/media_health.model';
import DeviceManager from '@/utils/DeviceManager';
import { BootPlaylistStore } from './canvas/BootPlaylistStore';
import { CanvasStatus } from './canvas/CanvasStatus';
import { CursorService } from './canvas/CursorService';
import { DisplaySettingsService } from './canvas/DisplaySettingsService';
import { MediaHealthHintStore } from './canvas/MediaHealthHints';
import { PlaybackOutcomeRing } from './canvas/PlaybackOutcomes';
import { PlaybackRecovery } from './canvas/PlaybackRecovery';
import { PlaybackSession } from './canvas/PlaybackSession';
import { PlaylistCommands } from './canvas/PlaylistCommands';
import { RecentPlaybackService } from './canvas/RecentPlaybackService';
import { ContentContext } from './contentPolicy';
import { CursorPositionListener } from './custom-hooks/useCursorPositions';
/** Stable command and route facade for the document-lifetime playback owners. */
class CanvasService {
  private static instance: CanvasService | null;

  public static getInstance() {
    CanvasService.instance ??= new CanvasService();
    return CanvasService.instance;
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

    const requestJson = messageData.request;
    const reply = this.commandHandler(command, requestJson);
    return reply;
  }

  private commandHandler(command: CastCommand, requestJson: unknown): Reply {
    // checkStatus is the daemon's five-second health poll. Keeping that local
    // loop silent prevents it from manufacturing permanent remote sessions.
    if (command !== CastCommand.checkStatus) {
      console.log('[CAST] commandHandler:', JSON.stringify(command));
    }
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
        case CastCommand.getRecentlyPlayed:
          return this.getRecentlyPlayed();
        case CastCommand.resolveRecentlyPlayed:
          return this.resolveRecentlyPlayed(requestJson);
        default:
          console.error(`[CAST] Unknown command: ${command}`);
          return { ok: false };
      }
    } catch (error) {
      console.error('[CAST] Error handling command:', error);
      return { ok: false };
    }
  }
  public addCursorPositionsListener(callback: CursorPositionListener) {
    this.cursors.addCursorPositionsListener(callback);
  }

  public removeCursorPositionsListener(callback: CursorPositionListener) {
    this.cursors.removeCursorPositionsListener(callback);
  }

  public primeRecentlyPlayed(): Promise<void> {
    return this.history.primeRecentlyPlayed();
  }

  /** Record a visual commit and return its generation-bound in-place recovery receipt. */
  public recordRecentlyPlayed(
    item: DP1Item,
    defaults: DP1Defaults | null = null,
    contentContext: ContentContext = 'curated'
  ): () => void {
    return this.history.recordRecentlyPlayed(item, defaults, contentContext);
  }

  private getRecentlyPlayed(): Reply & {
    status?: string;
    records?: unknown[];
    incomplete?: boolean;
    activeOccurrenceKnown?: boolean;
  } {
    return this.history.getRecentlyPlayed();
  }

  private resolveRecentlyPlayed(request: unknown): Reply & {
    item?: DP1Item;
    defaults?: DP1Defaults;
    contentContext?: ContentContext;
    status?: string;
  } {
    return this.history.resolveRecentlyPlayed(request);
  }

  public addDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.settings.addDisplaySettingsChangedListener(callback);
  }

  public removeDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.settings.removeDisplaySettingsChangedListener(callback);
  }

  public getCastInfo() {
    return this.session.getCastInfo();
  }

  public setCastInfo(castInfo: CastInfo | null, notify = true) {
    this.session.setCastInfo(castInfo, notify);
  }

  public setRenderStatus(renderStatus: RenderStatus | undefined) {
    this.session.setRenderStatus(renderStatus);
  }

  /** The live renderer lifecycle of the current selection (never persisted). */
  public getRenderStatus(): RenderStatus | undefined {
    return this.session.renderStatus;
  }

  // Whether the renderer's current load has a stuck-load bound (a per-slot
  // watchdog). HLS has none: a stalled live stream can stay `loading` with no
  // fatal error. The playlist only holds an expired slot for a bounded load
  // (see slotExpiry.ts). Live-only and never part of status replies.
  private renderLoadBounded = false;

  public setRenderLoadBounded(bounded: boolean) {
    this.renderLoadBounded = bounded;
  }

  public isRenderLoadBounded(): boolean {
    return this.renderLoadBounded;
  }

  public hasQueuedPlaylistPending(): boolean {
    return this.session.hasQueuedPlaylistPending();
  }

  public clearQueuedPlaylistPending() {
    this.session.clearQueuedPlaylistPending();
  }

  public hasDeferredRefreshPlaylist(): boolean {
    return this.session.hasDeferredRefreshPlaylist();
  }

  public getQueuedPlaylistItems(): DP1Item[] | null {
    return this.session.getQueuedPlaylistItems();
  }

  public consumeDeferredRefreshPlaylist(nextIndex: number): DP1Call | null {
    return this.session.consumeDeferredRefreshPlaylist(nextIndex);
  }

  public publishIndexUpdate(index: number): void {
    this.session.publishIndexUpdate(index);
  }

  public executeScheduledDP1Task(
    dp1CallData: DP1Call,
    contentContext?: ContentContext
  ): void {
    // A player-local scheduled task is a cast without a push, so it carries
    // no hints: the previous push's map must not judge a different list.
    this.hints.clear();
    this.playlists.executeScheduledDP1Task(dp1CallData, contentContext);
  }

  /**
   * MediaHealth contract v1: controld's hint for a source on the latest push,
   * or undefined when the source is not marked broken. The playlist timeline
   * consults this before mounting a slot; nothing else reads it.
   */
  public getMediaHealthHint(source: string): MediaHealthHint | undefined {
    return this.hints.hint(source);
  }

  /**
   * MediaHealth contract v1: append one per-play outcome to the status ring.
   * Called by the renderer's recovery owner for every mount decision and by
   * the timeline when it honours a hint. Never throws and never blocks
   * playback; the ring is observability only.
   */
  public recordPlaybackOutcome(input: PlaybackOutcomeInput): void {
    this.outcomes.record(input);
  }

  public castPlaylistByURL(
    playlistURL: string,
    shouldAbort?: () => boolean
  ): Promise<boolean> {
    return this.playlists.castPlaylistByURL(playlistURL, shouldAbort);
  }

  public registerDisplaySettingsReporter(
    reporter: Parameters<
      DisplaySettingsService['registerDisplaySettingsReporter']
    >[0],
    owner: object
  ): () => void {
    return this.settings.registerDisplaySettingsReporter(reporter, owner);
  }

  public getStatus(): CheckDeviceStatusReply {
    return this.status.getStatus();
  }

  private connect(): ConnectReplyV2 {
    return this.recovery.connect();
  }

  public disconnect(): DisconnectReplyV2 {
    // A cleared wall has nothing the hints could describe.
    this.hints.clear();
    return this.recovery.disconnect();
  }

  public wasHaltedDuringBootHydration(): boolean {
    return this.recovery.wasHaltedDuringBootHydration();
  }

  public didHydrationHaltClearCast(): boolean {
    return this.recovery.didHydrationHaltClearCast();
  }

  public hasActiveArtwork(): boolean {
    return this.session.hasActiveArtwork();
  }

  public bootHydrationState():
    | 'pending'
    | 'ok'
    | 'halted_cleared'
    | 'halted_preserving'
    | 'failed' {
    return this.recovery.bootHydrationState();
  }

  public setSleepMode(request: SetSleepModeRequest): SetSleepModeReply {
    return this.recovery.setSleepMode(request);
  }

  private moveToArtwork(request: MoveToItemRequest): MoveToItemReply {
    return this.session.moveToArtwork(request);
  }

  public requestArtworkRefresh(): boolean {
    return this.session.requestArtworkRefresh();
  }

  private refreshArtwork(): Reply {
    return this.session.refreshArtwork();
  }

  public updateCursorPositions(
    request: UpdateCursorPositionsRequest
  ): UpdateCursorPositionsReply {
    return this.cursors.updateCursorPositions(request);
  }

  public updateArtFraming(request: UpdateArtFramingRequest): Reply {
    return this.settings.updateArtFraming(request);
  }

  public updateDisplaySettings(
    request: UpdateDisplaySettingsRequest
  ): UpdateDisplaySettingsReply {
    return this.settings.updateDisplaySettings(request);
  }

  private displayPlaylist(
    request: DisplayPlaylistRequest
  ): DisplayPlaylistReply {
    const reply = this.playlists.displayPlaylist(request);
    // Hints ride every accepted push that changes what is on the wall: a
    // cast, a boot cast, and a refresh. A status query and a scheduled cast
    // describe a list that is not playing, so they leave the live map alone.
    // Installed AFTER the command so a rejected push cannot leave the hints
    // of a cast that never landed judging the one still playing.
    const action = request.intent?.action;
    if (
      reply.ok &&
      action !== DP1Action.GetCurrentPlaylist &&
      action !== DP1Action.SchedulePlay
    ) {
      this.hints.replace(request.mediaHealth);
    }
    return reply;
  }

  private setShuffle(request: SetShuffleRequest): Reply {
    return this.session.setShuffle(request);
  }

  private updateDefaultDuration(
    request: UpdateDefaultDurationRequest | undefined
  ): Reply {
    return this.session.updateDefaultDuration(request);
  }

  private setLoop(request: SetLoopRequest): Reply {
    return this.session.setLoop(request);
  }

  private refreshPlaylist(
    newItems: DP1Item[] | undefined,
    // The origin the caller actually filtered under. It must travel with the
    // refreshed state: admission used this value, and setCastInfo re-applies
    // policy from what is stored, so leaving the previous cast's context in
    // place would let one origin choose the items and a different one judge
    // them on the next policy change.
    contentContext?: ContentContext
  ): Reply {
    return this.session.refreshPlaylist(newItems, contentContext);
  }

  private displayDefaultPlaylist(
    request?: DisplayDefaultPlaylistRequest
  ): DisplayDefaultPlaylistReply {
    return this.recovery.displayDefaultPlaylist(request);
  }

  public completeBootCastHydration(outcome?: 'ok' | 'failed') {
    this.recovery.completeBootCastHydration(outcome);
  }

  private readonly history = new RecentPlaybackService();
  private readonly session = new PlaybackSession(this.history);
  private readonly boot = new BootPlaylistStore();
  private readonly settings = new DisplaySettingsService();
  private readonly cursors = new CursorService();
  private readonly recovery = new PlaybackRecovery(this.session, this.history);
  private readonly hints = new MediaHealthHintStore();
  private readonly outcomes = new PlaybackOutcomeRing();
  private readonly status = new CanvasStatus(
    this.session,
    this.settings,
    this.outcomes
  );
  private readonly playlists = new PlaylistCommands(
    this.session,
    this.history,
    this.boot,
    {
      processMessage: message => this.processMessage(message),
      getStatus: () => this.getStatus(),
      beginCast: () => {
        this.outcomes.beginCast();
      },
    }
  );
  get onCastInfoChange() {
    return this.session.onCastInfoChange;
  }
  set onCastInfoChange(handler: ((castInfo: CastInfo | null) => void) | null) {
    this.session.onCastInfoChange = handler;
  }
  get onRefreshArtwork() {
    return this.session.onRefreshArtwork;
  }
  set onRefreshArtwork(handler: (() => boolean) | null) {
    this.session.onRefreshArtwork = handler;
  }
}
export const canvasService = CanvasService.getInstance();
