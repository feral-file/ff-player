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
  UpdateSeriesPlaybackRequest,
} from '@/models/cast_request_reply.model';
import {
  DP1Call,
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { BootPlaylistStore } from './canvas/BootPlaylistStore';
import { CanvasStatus } from './canvas/CanvasStatus';
import { CursorService } from './canvas/CursorService';
import { DisplaySettingsService } from './canvas/DisplaySettingsService';
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
        case CastCommand.updateSeriesPlayback:
          return this.updateSeriesPlayback(
            requestJson as UpdateSeriesPlaybackRequest
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

  public recordRecentlyPlayed(
    item: DP1Item,
    defaults: DP1Defaults | null = null,
    contentContext: ContentContext = 'curated'
  ): void {
    this.history.recordRecentlyPlayed(item, defaults, contentContext);
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
    this.playlists.executeScheduledDP1Task(dp1CallData, contentContext);
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
    return this.playlists.displayPlaylist(request);
  }

  private setShuffle(request: SetShuffleRequest): Reply {
    return this.session.setShuffle(request);
  }

  private updateDefaultDuration(
    request: UpdateDefaultDurationRequest | undefined
  ): Reply {
    return this.session.updateDefaultDuration(request);
  }

  private updateSeriesPlayback(
    request: UpdateSeriesPlaybackRequest | undefined
  ): Reply {
    return this.session.updateSeriesPlayback(request);
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
  private readonly status = new CanvasStatus(this.session, this.settings);
  private readonly playlists = new PlaylistCommands(
    this.session,
    this.history,
    this.boot,
    this
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
