import { NO_DURATION_VALUE } from '@/constants';
import {
  CastCommand,
  DisplayPlaylistReply,
  DisplayPlaylistRequest,
  RenderStatus,
} from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import {
  CheckDeviceStatusReply,
  NowDisplayReply,
  NowDisplayRequest,
  Reply,
  SchedulePlaylistReply,
  SchedulePlaylistRequest,
} from '@/models/cast_request_reply.model';
import { CustomEventName } from '@/models/custom_event';
import { DP1Action, DP1Call, DP1Item } from '@/models/dp1.model';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { contentPolicyStore, policyInForce } from '../ContentPolicyStore';
import DP1ScheduleService from '../DP1ScheduleService';
import { DP1Service } from '../DP1Service';
import {
  admitUnfiltered,
  allowsContent,
  ContentContext,
  ContentPolicy,
  filterContent,
  hasValidContentLabels,
  parseContentContext,
} from '../contentPolicy';
import { BootPlaylistStore } from './BootPlaylistStore';
import { PlaybackSession } from './PlaybackSession';
import { RecentPlaybackService } from './RecentPlaybackService';
import { findInvalidArtworkSource } from './artworkSourceValidation';
import {
  isSameSelectedArtworkIdentity,
  refreshedSelectionIndex,
  selectedPlaylistItem,
} from './playlistUpdates';
/** Applies DP1 commands through the live session, history, and boot-record owners while preserving admission and persistence ordering. */
export class PlaylistCommands {
  // True only while castPlaylistByURL's own displayPlaylist message is being
  // processed (that chain is fully synchronous), so nowDisplayPlaylist can
  // tell the boot-fallback cast apart from an explicit controller cast and
  // skip the ExplicitPlaylistCast dispatch. The fallback settling itself must
  // not look like an explicit cast: it would cancel a displayDefaultPlaylist
  // request that landed while the attempt was in flight — the case
  // AppContext's nonce guard exists to preserve.
  private castingFallbackPlaylist = false;

  public executeScheduledDP1Task(
    dp1CallData: DP1Call,
    contentContext?: ContentContext
  ): void {
    console.log('[CanvasService] Executing scheduled DP1 task with data');
    // Scheduled tasks are persisted recovery snapshots. Their source passed
    // validation when initially accepted (or predates this guard), so do not
    // reinterpret it as a new live cast when its timer fires after an upgrade.
    this.nowDisplayPlaylist({ dp1CallData, contentContext }, false);
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
   *
   * `shouldAbort` is re-checked between the fetch resolving and the cast
   * committing. The fetch can be in flight when an explicit cast lands; the
   * commit happens inside this method, so without this hook the caller's own
   * cancellation flag is checked too late and the stale fallback fetch would
   * overwrite the explicit cast.
   */
  public async castPlaylistByURL(
    playlistURL: string,
    shouldAbort?: () => boolean
  ): Promise<boolean> {
    try {
      console.log('[CanvasService] Fetching playlist from:', playlistURL);
      const defaultPlaylist = await DP1Service.getPlaylist(playlistURL);

      if (!defaultPlaylist) {
        return false;
      }

      if (shouldAbort?.()) {
        console.log('[CanvasService] Fallback cast aborted before commit');
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

      // Simulate processMessage with the built message data. The flag marks
      // the synchronous processMessage → nowDisplayPlaylist chain as
      // fallback-originated so it does not announce itself as an explicit
      // cast (see castingFallbackPlaylist).
      console.log('[CanvasService] Processing default playlist message');
      this.castingFallbackPlaylist = true;
      let reply: Reply | undefined;
      try {
        reply = this.processMessage(messageData);
      } finally {
        this.castingFallbackPlaylist = false;
      }

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

  // DP1 Handlers

  public displayPlaylist(
    request: DisplayPlaylistRequest
  ): DisplayPlaylistReply {
    const dp1Intent = request.intent;
    const dp1CallData = request.dp1_call;
    const playlistUrl = request.playlistUrl;
    const action = dp1Intent?.action;
    if (action === DP1Action.GetCurrentPlaylist) {
      return this.getStatus();
    }
    if (!dp1CallData) {
      return { ok: false, error: 'playlistInvalid' };
    }
    const contentContext = request.refresh
      ? this.refreshContentContext(request)
      : parseContentContext(
          'contentContext' in request ? request.contentContext : undefined
        );
    if (dp1CallData.items?.some(item => !hasValidContentLabels(item))) {
      return { ok: false, error: 'playlistInvalid' };
    }

    console.log('[CanvasService] display playlist: ', action);

    if (request.refresh) {
      return this.refreshUnderPolicy(request, dp1CallData, contentContext);
    }

    let reply: Reply;
    switch (action) {
      case DP1Action.NowDisplay: {
        return this.nowDisplayPlaylist({
          dp1CallData,
          playlistUrl,
          contentContext,
        });
      }

      case DP1Action.SchedulePlay: {
        return this.schedulePlaylist({
          dp1CallData,
          scheduleTime: dp1Intent?.schedule_time,
          contentContext,
        });
      }

      case DP1Action.DisplayAtBoot: {
        // The boot cast carries its origin like every other cast: dropping it
        // here would filter a personal cast as curated now, and persisting it
        // without the context would repeat that on every restart.
        reply = this.nowDisplayPlaylist({
          dp1CallData,
          playlistUrl,
          contentContext,
        });

        if (reply.ok) {
          this.boot.persistBootPlaylist(dp1CallData, contentContext);
        }
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

  /**
   * The origin a refresh is filtered and stored under.
   *
   * A refresh updates the source of a cast that already exists, so it may carry
   * an origin forward or narrow it — never widen it. An absent context means
   * "unchanged" and inherits the cast's own origin; defaulting it to curated
   * instead would re-filter a viewer's personal cast every time its source
   * updated. An explicit `curated` narrows, and takes effect.
   *
   * An explicit `personal` is only honoured when the live cast is ALREADY
   * personal. Otherwise a refresh could reclassify a curated playlist as
   * personal and walk mature content past the default filter without anyone
   * casting it — the one thing a source update must not be able to do.
   */
  public refreshContentContext(
    request: DisplayPlaylistRequest
  ): ContentContext {
    const current = parseContentContext(this.session.castInfo?.contentContext);
    if (!('contentContext' in request)) {
      return current;
    }
    const requested = parseContentContext(request.contentContext);
    return requested === 'personal' && current !== 'personal'
      ? current
      : requested;
  }

  /**
   * A source refresh under the current policy.
   *
   * Two outcomes differ in timing, not in what they allow. An ordinary refresh
   * hands the filtered item list to `refreshPlaylist`, which may defer the swap
   * until the current work ends. A current work that the refreshed labels now
   * block cannot use that path, or its outgoing crossfade: it retires
   * immediately, which is also what the daemon asks for with
   * `retireBlockedCurrent` when it has already dropped the blocked item from
   * its own projection.
   */
  public refreshUnderPolicy(
    request: DisplayPlaylistRequest,
    dp1CallData: DP1Call,
    contentContext: ContentContext
  ): DisplayPlaylistReply {
    const policy = this.admissionPolicy();
    const currentItems = this.session.castInfo?.playlist?.items ?? [];
    const currentItem = currentItems.at(
      normalizePlaylistIndex(
        this.session.castInfo?.index ?? 0,
        currentItems.length
      )
    );
    // Exact slot first, id alone second — the same precedence the on-screen and
    // selection lookups use below. Resolving by id alone found an EARLIER twin
    // of the selected work, so a refresh that blocked that twin tore down
    // playback to re-display the slot that was allowed the whole time.
    const updatedCurrent =
      currentItem &&
      (this.findSlot(dp1CallData.items, currentItem) ??
        dp1CallData.items?.find(item => item.id === currentItem.id));
    // The SELECTED work is not necessarily the one on screen: during a slow
    // handoff the selection has moved on while the previous work is still
    // showing. Refreshed labels that block what is on screen have to retire it
    // immediately — checking only the selection would filter that work out of
    // the projection and leave it rendering under its stale labels until the
    // incoming work commits, which may never happen.
    //
    // Matched by id ALONE, unlike the rendering gate: a refresh may give the
    // same work a new source, and that is still the same work carrying new
    // labels. Requiring the old source would miss a source replacement that
    // also marks the work mature.
    const onScreen = this.history.currentItem;
    // Exact slot first, id alone second. DP-1 lets a playlist repeat an id, so
    // matching by id alone can resolve a DIFFERENT slot — the allowed twin of
    // the work actually on screen — and skip retiring the blocked one. Matching
    // by the pair alone is no good either: a refresh may give the same work new
    // media, and requiring the old source would miss a source replacement that
    // also marks it mature. Prefer the exact pair, fall back to the id.
    const updatedOnScreen =
      onScreen &&
      (this.findSlot(dp1CallData.items, onScreen) ??
        dp1CallData.items?.find(item => item.id === onScreen.id));
    // A work the refresh still carries is judged on its FRESH labels; a work it
    // omits is judged on the labels it already has, because the refresh may
    // have narrowed the context instead of relabelling anything. Without that
    // second case, a personal cast refreshed as curated deferred its allowed
    // replacement, then republished the now-blocked current work, which
    // filtered to nothing — a blank wall, the replacement discarded, and `ok`
    // returned to the controller.
    const blocks = (work: DP1Item | undefined | null): boolean =>
      policy !== null && !!work && !allowsContent(work, policy, contentContext);
    const retireCurrent =
      blocks(updatedCurrent ?? currentItem) ||
      blocks(updatedOnScreen ?? onScreen);
    // The selection is carried into the projection so filterContent can resolve
    // the next allowed slot at or after it, rather than defaulting to the first.
    // It has to be the selected work's position in the INCOMING payload, not in
    // the live list: the live list is already a projection, so a payload that
    // still carries blocked works is indexed differently and the live index
    // would land on an earlier work — sending the viewer backward.
    const incomingItems = dp1CallData.items ?? [];
    // Same precedence as above: the selected work's own slot when the payload
    // still carries it, otherwise the first slot sharing its id.
    const selected = refreshedSelectionIndex(incomingItems, currentItem);
    const filtered =
      policy === null
        ? admitUnfiltered(dp1CallData)
        : filterContent(dp1CallData, policy, contentContext, selected);
    const bootKey = {
      id: this.session.castInfo?.playlistId,
      items: currentItems,
    };
    if (retireCurrent || request.retireBlockedCurrent === true) {
      const currentPlaylistUrl = this.session.castInfo?.playlistUrl;
      this.session.setCastInfo(null);
      const reply = filtered.playlist
        ? this.nowDisplayPlaylist({
            dp1CallData: filtered.playlist,
            contentContext,
            playlistUrl: currentPlaylistUrl,
            startIndex: filtered.index,
          })
        : { ok: true };
      contentPolicyStore.retireRendering();
      if (reply.ok) {
        this.boot.supersedeBootRecord(
          bootKey,
          filtered.playlist,
          contentContext
        );
      }
      return reply;
    }
    if (!filtered.playlist) {
      // An empty incoming list is an instruction to clear, not a playlist whose
      // every work is blocked. Reporting contentBlocked for it would leave the
      // old artwork on the wall against the source's own update.
      if (!dp1CallData.items?.length) {
        const cleared = this.session.refreshPlaylist([], contentContext);
        if (cleared.ok) {
          this.boot.supersedeBootRecord(bootKey, null, contentContext);
        }
        return cleared;
      }
      return { ok: false, error: 'contentBlocked' };
    }
    const applied = this.session.refreshPlaylist(
      filtered.playlist.items,
      contentContext
    );
    if (applied.ok) {
      this.boot.supersedeBootRecord(bootKey, filtered.playlist, contentContext);
    }
    return applied;
  }

  public nowDisplayPlaylist(
    request: NowDisplayRequest,
    validateSources = true
  ): NowDisplayReply {
    if (!request.dp1CallData.items?.length) {
      console.error('[CanvasService] No items to display');
      return { ok: false };
    }
    if (request.dp1CallData.items.some(item => !hasValidContentLabels(item))) {
      return { ok: false, error: 'playlistInvalid' };
    }
    const contentContext = parseContentContext(request.contentContext);
    const admissionPolicy = this.admissionPolicy();
    const filtered =
      admissionPolicy === null
        ? admitUnfiltered(request.dp1CallData)
        : filterContent(request.dp1CallData, admissionPolicy, contentContext);
    if (!filtered.playlist) {
      return { ok: false, error: 'contentBlocked' };
    }
    request = { ...request, dp1CallData: filtered.playlist };
    const playableItems = filtered.playlist.items ?? [];
    // Live casts validate; persisted scheduled/boot recovery may skip so an
    // upgrade does not strand a previously accepted playlist (see
    // executeScheduledDP1Task). Do not add a second unconditional check here.
    if (validateSources) {
      const invalidSourceItem = findInvalidArtworkSource(
        request.dp1CallData.items
      );
      if (invalidSourceItem) {
        console.error('[CanvasService] Invalid artwork source:', {
          itemId: invalidSourceItem.id,
          source: invalidSourceItem.source,
        });
        return { ok: false };
      }
    }

    // Clear any stored original playlist from a previous shuffle session and any
    // deferred refresh waiting to be applied — a fresh display supersedes both.
    this.session.resetPlaylistOrder();
    // Re-casting the artwork already on screen must not reset the lifecycle.
    // ArtworkPlayer only re-publishes when previewURL/itemIdentity change, so a
    // forced pending here would never be answered and status polls would report
    // pending for a visibly rendered artwork. Casts that do change the selected
    // artwork still get their pending from resolveRenderStatusForCastInfo.
    const currentSelectedItem = selectedPlaylistItem(
      this.session.castInfo?.playlist?.items,
      this.session.castInfo?.index
    );
    if (!isSameSelectedArtworkIdentity(currentSelectedItem, playableItems[0])) {
      this.session.setRenderStatus(RenderStatus.pending);
    }

    console.log('[CanvasService] Display playlist');
    // Each Now Display starts a new cast session surface: do not inherit prior
    // shuffle / loop toggles from the previous playlist on the same device tab.
    this.session.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      contentContext,
      playlist: {
        ...request.dp1CallData,
        items: playableItems.map(item => ({
          ...item,
          duration: item.duration ?? NO_DURATION_VALUE,
        })),
      },
      playlistUrl: request.playlistUrl,
      index: normalizePlaylistIndex(
        request.startIndex ?? 0,
        playableItems.length
      ),
      playlistId: request.dp1CallData.id,
      loopMode: LoopMode.playlist,
      shuffle: false,
    });
    // Explicit content is now on screen — tell AppContext so an active
    // boot-fallback retry (failed or still fetching) cannot fire later and
    // replace it with the default playlist. The fallback's own cast is
    // excluded: its lifecycle ends via the loop's nonce-guarded clear. The
    // window guard keeps node-environment unit tests (no DOM) from turning a
    // successful display into an ok:false reply — the event is a
    // browser-only signal.
    if (
      !this.castingFallbackPlaylist &&
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent !== 'undefined'
    ) {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.ExplicitPlaylistCast as string)
      );
    }
    return { ok: true };
  }

  public schedulePlaylist(
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
    // Same order as an immediate cast: policy first, sources second. Validating
    // the raw list would let a blocked work's unsupported source reject a
    // schedule whose playable works are all fine, and it would store items this
    // version never validated — the scheduled task is a recovery snapshot that
    // is replayed without re-validation, exactly like the boot record.
    const policy = this.admissionPolicy();
    const filtered =
      policy === null
        ? admitUnfiltered(request.dp1CallData)
        : filterContent(
            request.dp1CallData,
            policy,
            request.contentContext ?? 'curated'
          );
    if (!filtered.playlist) {
      return { ok: false, error: 'contentBlocked' };
    }
    if (findInvalidArtworkSource(filtered.playlist.items)) {
      console.error('[CanvasService] Invalid artwork source');
      return { ok: false };
    }

    console.log('[CanvasService] Schedule playlist');
    DP1ScheduleService.storeScheduledTask(
      filtered.playlist,
      request.scheduleTime.replace('Z', ''),
      request.contentContext
    ).catch((error: unknown) => {
      console.error('[CanvasService] Error storing scheduled task:', error);
    });

    return { ok: true };
  }

  /** The playlist slot matching a work exactly: same id AND same media. */
  public findSlot(
    items: DP1Item[] | undefined,
    work: DP1Item
  ): DP1Item | undefined {
    return items?.find(
      item => item.id === work.id && item.source === work.source
    );
  }

  /**
   * The policy admission must apply, or `null` while the device's own mirror is
   * still being read.
   *
   * `null` admits the cast whole and keeps the complete payload in castInfo.
   * The hydration publish then runs `reconcileContentPolicy`, which re-applies
   * the real policy to that payload and retires anything it blocks. Filtering
   * against the built-in default during that window would do the opposite of
   * what it looks like: it would reject a cast the viewer explicitly opted into
   * and permanently drop items from a mixed playlist, leaving nothing for
   * reconciliation to restore. An unreadable mirror is a different case and is
   * refused at the command boundary — see `displayPlaylist`.
   */
  public admissionPolicy(): Readonly<ContentPolicy> | null {
    const snapshot = contentPolicyStore.getSnapshot();
    return policyInForce(snapshot);
  }
  constructor(
    private readonly session: PlaybackSession,
    private readonly history: RecentPlaybackService,
    private readonly boot: BootPlaylistStore,
    private readonly commands: {
      processMessage: (message: Record<string, unknown>) => Reply | undefined;
      getStatus: () => CheckDeviceStatusReply;
    }
  ) {}
  private processMessage(message: Record<string, unknown>) {
    return this.commands.processMessage(message);
  }
  private getStatus() {
    return this.commands.getStatus();
  }
}
