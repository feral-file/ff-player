import {
  CastCommand,
  CastInfo,
  MoveToArtworkReply as MoveToItemReply,
  MoveToArtworkRequest as MoveToItemRequest,
  RenderStatus,
  SetLoopRequest,
  SetShuffleRequest,
} from '@/models';
import {
  Reply,
  UpdateDefaultDurationRequest,
} from '@/models/cast_request_reply.model';
import { DP1Call, DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { stripLegacyCastPlaybackTimeline } from '@/utils/castInfo';
import { deepEqual } from '@/utils/helper';
import { coerceLoopMode } from '@/utils/loopMode';
import {
  normalizePlaylistIndex,
  resolveItemIndexInNewItems,
} from '@/utils/playlist';
import { contentPolicyStore, policyInForce } from '../ContentPolicyStore';
import {
  allowsContent,
  ContentContext,
  ContentPolicy,
  filterContent,
  parseContentContext,
  stripPlaylistSignature,
} from '../contentPolicy';
import { RecentPlaybackService } from './RecentPlaybackService';
import { findInvalidArtworkSource } from './artworkSourceValidation';
import {
  isSamePlaylistContent,
  normalizeItemDurations,
  resolveRenderStatusForCastInfo,
  selectedPlaylistItem,
} from './playlistUpdates';
/** Owns the live cast and queued playlist intent. All cast publication and render-status continuity pass through this owner. */
export class PlaybackSession {
  private currentCast: CastInfo | null = null;

  private currentRenderStatus: RenderStatus | undefined;

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

  public getCastInfo() {
    console.log('[CanvasService] Retrieving castInfo');
    return this.currentCast;
  }

  public setCastInfo(castInfo: CastInfo | null, notify = true) {
    console.log('[CanvasService] Setting castInfo:', notify);
    const incoming = castInfo;
    const inForce = policyInForce(contentPolicyStore.getSnapshot());
    if (castInfo?.playlist?.items?.length && inForce) {
      const filtered = filterContent(
        castInfo.playlist,
        inForce,
        parseContentContext(castInfo.contentContext),
        castInfo.index ?? 0
      );
      castInfo = filtered.playlist
        ? { ...castInfo, playlist: filtered.playlist, index: filtered.index }
        : null;
    }
    // AFTER filtering, so this sees what the cast actually became: a policy
    // reconciliation that drops the visible work while keeping another is a
    // displacement just as much as a replacement cast is. The work whose record
    // is active leaves the wall when the resulting cast no longer contains it —
    // the rendering gate cannot find it and unmounts, and nothing has committed
    // in its place — so reporting it as displayed would describe a blank or
    // loading screen. An advance WITHIN the same playlist keeps the item and is
    // left alone: that transition really is still showing the outgoing work.
    this.history.retireActiveOccurrenceIfDisplaced(incoming, castInfo);
    if (castInfo === null) {
      this.queuedPlaylistPending = false;
      this.setDeferredRefreshPlaylist(null);
      this.pendingRefreshArtwork = false;
      this.currentRenderStatus = undefined;
      this.currentCast = null;
      // The wall is cleared. Retained history survives — it is a timeline, not
      // current state — but nothing is playing, so no occurrence is active.
      this.history.retireActiveRecentlyPlayed();
    } else {
      if (!isSamePlaylistContent(this.currentCast, castInfo)) {
        // A REAL cast-content change supersedes any refresh parked against
        // the PREVIOUS artwork (refreshArtwork's handler_pending /
        // preview_update_failed refusals — see refreshArtwork below):
        // replaying it later would refresh whatever is now on screen, not the
        // artwork the refusal was actually about. The no-artwork refusal has
        // nothing to supersede — it never sets the flag in the first place.
        //
        // Narrower than "every non-null setCastInfo" on purpose: a bare
        // `connect`, a loop-mode/duration setter, a wake, or a slot advance
        // (moveToArtwork) all pass through here too, but none of them replace
        // the playlist the parked refresh is about — clearing on those drops
        // the player's own reconnect refresh for no reason.
        this.pendingRefreshArtwork = false;
      }
      // Both reads above and below must happen before this.currentCast is
      // reassigned: they compare the outgoing cast against the incoming one.
      const nextRenderStatus = resolveRenderStatusForCastInfo(
        this.currentCast,
        castInfo,
        this.currentRenderStatus
      );
      this.currentCast = {
        ...stripLegacyCastPlaybackTimeline(castInfo),
        renderStatus: nextRenderStatus,
      };
      // Keep the private mirror in lockstep so getStatus never reads a stale
      // castInfo.renderStatus left over from persistence or a prior item.
      this.currentRenderStatus = nextRenderStatus;
    }
    if (notify) {
      this.onCastInfoChange?.(this.currentCast);
    }
  }

  /** Retire blocked recovery/queued snapshots when a durable policy changes. */
  public reconcileContentPolicy(): void {
    const policy = this.admissionPolicy();
    const context = parseContentContext(this.currentCast?.contentContext);
    const keep = (item: DP1Item): boolean =>
      policy === null || allowsContent(item, policy, context);

    // Queued controller intent is RE-FILTERED, never discarded. A refresh the
    // device accepted is a replacement it promised to make; dropping it because
    // an unrelated setting changed loses that replacement silently and leaves
    // the stale list playing. The same goes for the unshuffled-order snapshot,
    // without which a later shuffle-off cannot restore the real order.
    this.originalPlaylistItems =
      this.originalPlaylistItems?.filter(keep) ?? null;
    const deferred = this.deferredRefreshPlaylist;
    const deferredItems = deferred?.items?.filter(keep) ?? [];
    if (deferred && deferredItems.length) {
      // The item list changed, so the signed document no longer describes it.
      this.setDeferredRefreshPlaylist(
        stripPlaylistSignature({ ...deferred, items: deferredItems })
      );
    } else if (deferred) {
      // Only when policy leaves nothing to install does the promise lapse.
      this.setDeferredRefreshPlaylist(null);
      this.queuedPlaylistPending = false;
    }

    if (!this.currentCast) {
      return;
    }
    // Re-issuing displayPlaylist makes the route rebuild its item array and
    // re-arm the slot timer, which restarts the artwork the viewer is watching.
    // When the projection is byte-for-byte what is already playing, this policy
    // change did not touch the wall and must not disturb it.
    const projected = this.projectedCast(this.currentCast, policy, context);
    if (projected !== null && this.isSameProjection(projected)) {
      return;
    }
    // setCastInfo retires the occurrence if this reconciliation removes the
    // work it belongs to, and leaves it alone if that work survives — a
    // policy change that keeps the same work playing must not blank History,
    // or it would sit at pending until an advance that may never come.
    this.setCastInfo({
      ...this.currentCast,
      castCommand: CastCommand.displayPlaylist,
    });
  }

  /** What setCastInfo would install for this cast, without installing it. */
  public projectedCast(
    cast: CastInfo,
    policy: Readonly<ContentPolicy> | null,
    context: ContentContext
  ): { items: DP1Item[]; index: number } | null {
    const playlist = cast.playlist;
    if (!playlist?.items?.length || policy === null) {
      return null;
    }
    const filtered = filterContent(playlist, policy, context, cast.index ?? 0);
    return filtered.playlist
      ? { items: filtered.playlist.items ?? [], index: filtered.index }
      : null;
  }

  /** True when a projection is exactly the list and slot already playing. */
  public isSameProjection(projected: {
    items: DP1Item[];
    index: number;
  }): boolean {
    return (
      projected.index === (this.currentCast?.index ?? 0) &&
      deepEqual(projected.items, this.currentCast?.playlist?.items ?? [])
    );
  }

  /** The work the current cast has selected, for displacement detection. */
  public selectedItem(): DP1Item | undefined {
    const items = this.currentCast?.playlist?.items ?? [];
    if (!items.length) {
      return undefined;
    }
    return items.at(
      normalizePlaylistIndex(this.currentCast?.index ?? 0, items.length)
    );
  }

  /** Identity of the work the current cast has selected, for change detection. */
  public selectedItemId(): string | undefined {
    return this.selectedItem()?.id;
  }

  /**
   * Publish the live artwork render lifecycle for status replies.
   * This updates in-memory castInfo without emitting a cast command. The
   * playlist route treats cast-info notifications as playback instructions,
   * so re-emitting the prior command here would restart the active slot timer.
   * Persistence strips renderStatus so boot recovery cannot resurrect a
   * ready/failed from a previous page.
   */
  public setRenderStatus(renderStatus: RenderStatus | undefined) {
    // A failed render is the other way a work stops being what the wall is
    // showing. ArtworkPlayer still commits a failed incoming slot visually (it
    // calls onItemCommitted and deliberately withholds onItemPlayed), so
    // without this the previous work's record would keep claiming to be active
    // behind a replacement that never rendered.
    //
    // Unlike a stop, a failure stays pending. The failed work may be an
    // incoming one, or the recorded work failing in place (WebGL context loss,
    // a mid-playback media error), which can recover without committing again
    // because ArtworkPlayer reports a showing as played only once. This
    // service cannot tell the two apart, and answering "nothing on the wall"
    // would list a recovered work as past.
    if (renderStatus === RenderStatus.failed) {
      this.history.markRenderFailed();
    }
    this.currentRenderStatus = renderStatus;
    if (!this.currentCast) {
      return;
    }

    this.currentCast = {
      ...this.currentCast,
      renderStatus,
    };
  }

  public hasQueuedPlaylistPending(): boolean {
    return this.queuedPlaylistPending;
  }

  public clearQueuedPlaylistPending() {
    this.queuedPlaylistPending = false;
  }

  public setDeferredRefreshPlaylist(next: DP1Call | null) {
    this.deferredRefreshPlaylist = next;
  }

  public flushPendingRefreshArtwork() {
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
    return this.currentCast?.playlist?.items ?? null;
  }

  public consumeDeferredRefreshPlaylist(nextIndex: number): DP1Call | null {
    const pending = this.deferredRefreshPlaylist;
    if (!pending) {
      return null;
    }
    this.queuedPlaylistPending = false;
    this.setDeferredRefreshPlaylist(null);
    this.setCastInfo({
      ...(this.currentCast ?? {}),
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
    const currentCastInfo = this.currentCast;
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

  /**
   * Mirrors refreshArtwork's exact "anything to refresh" check below, so the
   * CDP status probe and the live refusal path can never disagree about
   * whether the current cast has active artwork.
   */
  public hasActiveArtwork(): boolean {
    return Boolean(this.renderableCastInfo()?.playlist?.items?.length);
  }

  /**
   * The cast as far as anything OUTSIDE the player may describe it.
   *
   * Retained cast state and reportable cast state are not the same thing while
   * the policy mirror is unavailable. The renderer refuses to mount without an
   * applied policy, so a retained playlist is not on the wall — reporting it as
   * active would tell controld that a blank device is playing, and hide the
   * fail-closed state it needs to see in order to repair the mirror. The state
   * itself is kept, so a later durable policy resumes playback rather than
   * losing the cast.
   */
  public renderableCastInfo(): CastInfo | null {
    return policyInForce(contentPolicyStore.getSnapshot())
      ? this.currentCast
      : null;
  }

  // ---------------------------- Playlist controller ----------------------------
  public moveToArtwork(request: MoveToItemRequest): MoveToItemReply {
    console.log('[CanvasService] move to item', request.index);
    if (request.index < 0) {
      return { ok: false };
    }

    this.setCastInfo({
      ...this.currentCast,
      castCommand: CastCommand.moveToArtwork,
      index: request.index,
    });
    return { ok: true };
  }

  /**
   * Re-mounts the artwork currently on screen, for the app's OWN recovery
   * rather than a controller command. AppContext calls this when WAN
   * connectivity returns while the selected artwork failed to load: the
   * remount re-runs exactly the remote asset fetches that died offline, with
   * the player's normal crossfade, and without touching castInfo or playlist
   * position. It shares `refreshArtwork`'s pendingRefreshArtwork machinery,
   * so a nudge that arrives before the playlist route has registered its
   * handler is replayed once the handler lands instead of being dropped.
   * Returns whether the refresh was applied; a `false` result is not retried
   * here, the next connectivity notification is the retry.
   */
  public requestArtworkRefresh(): boolean {
    return this.refreshArtwork().ok;
  }

  public refreshArtwork(): Reply {
    const activeCastInfo = this.currentCast;
    // Refusals carry their reason in the reply, not only the console: the
    // daemon's boot recovery escalates a refused refresh to a Page.reload
    // and logs `message.error` to distinguish the expected "no active
    // artwork" escalation from a genuinely broken page. `code` is the same
    // classification as a stable machine-readable value — `error` stays
    // byte-for-byte unchanged for existing log readers.
    if (!activeCastInfo?.playlist?.items?.length) {
      console.error('[CanvasService] No active artwork to refresh');
      return {
        ok: false,
        error: 'No active artwork to refresh',
        code: 'no_artwork',
      };
    }

    if (!this._onRefreshArtwork) {
      this.pendingRefreshArtwork = true;
      console.warn(
        '[CanvasService] refreshArtwork: no playlist handler registered'
      );
      return {
        ok: false,
        error: 'No playlist handler registered yet',
        code: 'handler_pending',
      };
    }
    const applied = this._onRefreshArtwork();
    if (!applied) {
      // Third refusal flavor: a live page whose refresh path is broken
      // (registered handler, but it could not update the preview URL).
      // Parked the same way as the "no handler yet" branch above — playing
      // the artwork on a healthy re-registration is exactly the recovery
      // this refusal was refused for. flushPendingRefreshArtwork() replays
      // it on the next handler registration (including the second flush
      // trigger at the playlist route's reload registration).
      this.pendingRefreshArtwork = true;
      console.warn(
        '[CanvasService] refreshArtwork: handler could not update preview URL'
      );
      return {
        ok: false,
        error: 'Playlist handler could not update preview URL',
        code: 'preview_update_failed',
      };
    }
    this.pendingRefreshArtwork = false;
    // The playlist route applies the reload on a later React turn. Publish
    // pending before acknowledging the command so an immediate status poll
    // cannot report the prior artwork lifecycle.
    this.setRenderStatus(RenderStatus.pending);
    return { ok: true };
  }

  public setShuffle(request: SetShuffleRequest): Reply {
    const currentItems = this.currentCast?.playlist?.items;
    if (!currentItems?.length || !this.currentCast?.playlist) {
      console.error('[CanvasService] No playlist to shuffle');
      return { ok: false };
    }

    const enabled = (request as unknown as { enabled: boolean }).enabled;

    // Identify the currently playing item so it can be anchored in the new order
    const currentIndex = normalizePlaylistIndex(
      this.currentCast.index ?? 0,
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
        ...this.currentCast,
        castCommand: CastCommand.setShuffle,
        shuffle: true,
        index: 0,
        playlist: {
          ...this.currentCast.playlist,
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
        ...this.currentCast,
        castCommand: CastCommand.setShuffle,
        shuffle: false,
        index: newIndex,
        playlist: { ...this.currentCast.playlist, items: restored },
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
  public updateDefaultDuration(
    request: UpdateDefaultDurationRequest | undefined
  ): Reply {
    // A missing request envelope means "clear" — same as an explicit null.
    const raw = request?.durationSeconds ?? null;
    if (raw !== null && (!Number.isFinite(raw) || raw <= 0)) {
      console.error('[CanvasService] Invalid default duration:', raw);
      return { ok: false };
    }

    console.log('[CanvasService] updateDefaultDuration', raw);
    DeviceManager.setDefaultItemDurationSeconds(raw).catch((error: unknown) => {
      console.error(
        '[CanvasService] Error persisting default duration:',
        error
      );
    });

    if (this.currentCast) {
      this.setCastInfo({
        ...this.currentCast,
        castCommand: CastCommand.updateDefaultDuration,
      });
    }

    return { ok: true };
  }

  public setLoop(request: SetLoopRequest): Reply {
    const rawMode = (request as unknown as { mode: string }).mode;
    const mode = coerceLoopMode(rawMode);

    console.log('[CanvasService] setLoop', mode);
    this.setCastInfo({
      ...this.currentCast,
      castCommand: CastCommand.setLoop,
      loopMode: mode,
    });

    return { ok: true };
  }

  // Keep deferred-refresh, shuffle restoration, and index remapping together
  // because they all amend the same compatibility-sensitive cast contract.
  public refreshPlaylist(
    newItems: DP1Item[] | undefined,
    // The origin the caller actually filtered under. It must travel with the
    // refreshed state: admission used this value, and setCastInfo re-applies
    // policy from what is stored, so leaving the previous cast's context in
    // place would let one origin choose the items and a different one judge
    // them on the next policy change.
    contentContext?: ContentContext
  ): Reply {
    const currentPlaylist = this.currentCast?.playlist;
    const prior = this.currentCast
      ? { ...this.currentCast, ...(contentContext ? { contentContext } : {}) }
      : this.currentCast;
    if (findInvalidArtworkSource(newItems)) {
      console.error('[CanvasService] Invalid artwork source');
      return { ok: false };
    }
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
    const currentNormalizedItems = normalizeItemDurations(comparisonItems);
    const normalizedItems = normalizeItemDurations(newItems ?? []);
    if (deepEqual(currentNormalizedItems, normalizedItems)) {
      // A refresh that matches the canonical unshuffled list during an active
      // shuffle session must not tear down the queued shuffled state or force
      // the player back to the unshuffled order.
      // Identical items can still arrive under a DIFFERENT origin, and that
      // reclassification is the whole point of the refresh. Returning here
      // without publishing it would leave the cast judged under the old
      // context by every later policy change. `refreshPlaylist` is the one
      // command the client applies without restarting the slot — with no
      // queued playlist pending it breaks out untouched — so the context lands
      // and is persisted while the current work keeps playing.
      this.refreshUnchangedItems(prior);
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
    const playlistForRefresh = stripPlaylistSignature({
      ...currentPlaylist,
      items: normalizedItems,
    });

    const currentItemId = selectedPlaylistItem(prevItems, prevIndex)?.id;

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

  /** Preserve a queued shuffle while publishing an origin-only refresh. */
  private refreshUnchangedItems(prior: CastInfo | null): void {
    if (!(prior?.shuffle && this.originalPlaylistItems?.length)) {
      this.queuedPlaylistPending = false;
      this.setDeferredRefreshPlaylist(null);
    }
    console.log(
      '[CanvasService] New playlist is the same as the current playlist'
    );
    if (prior && this.currentCast?.contentContext !== prior.contentContext) {
      this.setCastInfo({ ...prior, castCommand: CastCommand.refreshPlaylist });
    }
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
  constructor(private readonly history: RecentPlaybackService) {
    contentPolicyStore.subscribe(() => {
      this.reconcileContentPolicy();
    });
  }
  get castInfo() {
    return this.currentCast;
  }
  get renderStatus() {
    return this.currentRenderStatus;
  }
  resetPlaylistOrder(): void {
    this.originalPlaylistItems = null;
    this.queuedPlaylistPending = false;
    this.setDeferredRefreshPlaylist(null);
  }
}
