import { NO_DURATION_VALUE } from '@/constants';
import type { CastInfo } from '@/models';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Defaults, DP1Item, DP1SeriesPlayback } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { coerceLoopMode } from '@/utils/loopMode';
import type { SlotMergedDisplay } from '@/utils/playlist';
import {
  isNoDurationItem,
  itemIdentityFor,
  mergedDisplayForSlot,
  normalizePlaylistIndex,
  resolveSequentialPlaylistAdvance,
  resolveSlotDurationSeconds,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldHoldForPendingMerge,
  shouldResumeSlotTimerAfterSetLoop,
} from '@/utils/playlist';
import {
  narrowForDevice,
  rawIndexForLocal,
  resolveQueuedSeriesSelection,
  resolveSeriesOverrideRebuild,
} from './seriesPlaybackView';
import { isSourceReplacement } from './sourceReplacement';
export interface TimelineEffects {
  readMergedDisplay: () => SlotMergedDisplay | null;
  clearMergedDisplay: () => void;
  clearMergedDisplayForNewCast: () => void;
  resetPreference: () => void;
  clearPreview: () => void;
  triggerArtworkRefresh: () => boolean;
  reload: () => void;
}
export interface TimelineUI {
  setPlaylist: (items: DP1Item[]) => void;
  setIndex: (index: number) => void;
  setDefaults: (defaults: DP1Defaults | null) => void;
}
type AdvanceCause = 'timer' | 'sourceEnd';
interface ArmedInterval {
  duration: number;
  deadline: number;
}
/** Owns timer deadlines, selected-slot mirrors, loop/hold state, and every advance decision. */
export class PlaylistTimeline {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private armed: ArmedInterval | null = null;
  private slotStartedAt = 0;
  private currentItem: DP1Item | undefined;
  private index = -1;
  private items: DP1Item[] = [];
  private defaults: DP1Defaults | null = null;
  private loop = LoopMode.playlist;
  private holding = false;
  /**
   * The series-playback override the playable list on screen was narrowed
   * with. `rebuildForSeriesOverride` needs it to carry the selected slot
   * across a First<->Full flip, and cannot read it from DeviceManager: the
   * command has already stored the new value by the time it runs. Recorded
   * only where a list is built from a value that may have changed — a fresh
   * cast, and the flip itself — because the override changes through
   * `updateSeriesPlayback` alone, so every other command narrows with the
   * value already recorded here.
   */
  private narrowedWith: DP1SeriesPlayback | null = null;
  /**
   * One-shot: the identity of the showing whose running deadline the next arm
   * must keep. `updateSeriesPlayback` rebuilds the playable list into a fresh
   * array even when it narrows nothing away, which re-runs the route's
   * slot-entry effect; without this the artwork on screen would be granted a
   * whole new interval, so a 10s slot asked to change series mode at second 9
   * would advance at second 19. Keyed by the showing rather than held as a
   * bare flag, so a slot entry that never arms — content policy blocking the
   * work — cannot leak the preserve onto an unrelated slot later.
   */
  private preserveArmFor: string | null = null;
  private effects: TimelineEffects | undefined;
  constructor(private readonly ui: TimelineUI) {}
  bind(effects: TimelineEffects) {
    this.effects = effects;
  }
  private get ports() {
    if (!this.effects) {
      throw new Error('Playlist timeline is not bound');
    }
    return this.effects;
  }
  observeView(items: DP1Item[], index: number, defaults: DP1Defaults | null) {
    this.items = items;
    this.index = index;
    this.defaults = defaults;
  }
  readSlot = () => ({
    index: this.index,
    items: this.items,
    item: this.currentItem,
  });
  commitSelection(index: number, items: DP1Item[]) {
    this.currentItem =
      index < 0 || !items.length
        ? undefined
        : items[normalizePlaylistIndex(index, items.length)];
  }
  clearEmptySlot() {
    this.holding = false;
    this.clearTimer();
  }
  /** Publishes a local (narrowed) selection in the raw space castInfo uses. */
  private publishIndex(localIndex: number) {
    canvasService.publishIndexUpdate(rawIndexForLocal(localIndex));
  }
  clearTimer = () => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  };
  private clearPlayable() {
    this.currentItem = undefined;
    this.ui.setPlaylist([]);
    this.ui.setIndex(-1);
    this.ui.setDefaults(null);
    this.ports.resetPreference();
    this.ports.clearPreview();
  }
  private replay(index: number, snapshot: DP1Item[], cause: AdvanceCause) {
    if (!snapshot.length) {
      return;
    }
    const item = snapshot[normalizePlaylistIndex(index, snapshot.length)];
    if (cause === 'sourceEnd' || isNoDurationItem(item)) {
      this.ports.reload();
    }
  }
  private applyQueued(
    targetIndex?: number,
    keepCurrent = false
  ): { applied: boolean } {
    if (!canvasService.hasQueuedPlaylistPending()) {
      return { applied: false };
    }

    // Items are owned by CanvasService — no duplicate storage needed.
    const queuedPlaylist = canvasService.getQueuedPlaylistItems();
    if (!queuedPlaylist?.length) {
      canvasService.clearQueuedPlaylistPending();
      return { applied: false };
    }

    this.holding = false;
    // Queued refresh/shuffle replaces the item list; same-id items may
    // carry changed display fields, so the cached merge cannot be trusted.
    this.ports.clearMergedDisplay();

    const hasDeferredRefresh = canvasService.hasDeferredRefreshPlaylist();
    const currentCastInfo = canvasService.getCastInfo();
    // A queued refresh/shuffle installs items straight from CanvasService,
    // so this path has to narrow them itself: it is not reached through any
    // of the cast-command branches that already do.
    const {
      items: nextItems,
      localIndex: nextIndex,
      rawIndex: rawNextIndex,
    } = resolveQueuedSeriesSelection({
      targetIndex,
      queuedPlaylist,
      previousItems: currentCastInfo?.playlist?.items,
      hasDeferredRefresh,
      currentItemId: this.currentItem?.id,
      keepCurrent,
    });

    this.ui.setPlaylist(nextItems);
    this.ui.setIndex(nextIndex);
    // Sync the selection immediately so a same-tick concurrent caller sees the
    // new state instead of re-entering against the old snapshot.
    this.items = nextItems;
    this.index = nextIndex;

    // consumeDeferredRefreshPlaylist atomically promotes the deferred refresh
    // onto castInfo so getStatus reflects the new list from the first frame.
    // Queued refresh/shuffle only changes playlist items and index; defaults
    // stay owned by the active playlist contract and are intentionally left as-is.
    // This takes the RAW index: castInfo.playlist and castInfo.index are
    // never narrowed (see rawIndexForLocal for why that has to hold).
    const consumed =
      canvasService.consumeDeferredRefreshPlaylist(rawNextIndex);
    if (!consumed) {
      canvasService.clearQueuedPlaylistPending();
      this.publishIndex(nextIndex);
    }

    return { applied: true };
  }
  private advance(
    fromIndex: number,
    snapshot: DP1Item[],
    cause: AdvanceCause = 'timer',
    retryOnFinalHold = false
  ): void {
    if (!snapshot.length) {
      return;
    }
    if (this.index !== fromIndex) {
      return;
    }

    this.clearTimer();
    this.holding = false;

    if (this.loop === LoopMode.one) {
      // keepCurrent=true keeps loop on this artwork after a queued
      // refresh; falls back to index 0 if the item was removed.
      if (this.applyQueued(undefined, true).applied) {
        // Same-id same-source queued refresh leaves previewURL/identity
        // unchanged, so ArtworkPlayer does not recreate the slot.
        // Restart playback if the source ended or has no duration.
        this.replay(this.index, this.items, cause);
        return;
      }
      this.publishIndex(fromIndex);
      this.schedule(fromIndex, snapshot);
      this.replay(fromIndex, snapshot, cause);
      return;
    }

    const queuedResult = this.applyQueued();
    if (queuedResult.applied) {
      this.replay(this.index, this.items, cause);
      return;
    }

    const nextIndex = resolveSequentialPlaylistAdvance({
      currentIndex: fromIndex,
      playlistLength: snapshot.length,
      loopMode: this.loop,
    });
    if (nextIndex === null) {
      // Repeat-off holds the final work. Failure retries in place because
      // there is no next target; queued updates have already had first refusal.
      if (this.loop === LoopMode.none && fromIndex === snapshot.length - 1) {
        if (retryOnFinalHold) {
          // Keep the hold flag so setLoop and queued updates still release
          // this slot after its in-place retry recovers.
          this.holding = true;
          this.replay(fromIndex, snapshot, cause);
          return;
        }
        this.holding = true;
      }
      return;
    }

    // Single-item playlist: nextIndex wraps back to the same position.
    // setCurrentIndex would be a no-op and React would not re-run the
    // scheduling effect. Reschedule directly to keep the loop alive.
    if (nextIndex === fromIndex) {
      this.publishIndex(nextIndex);
      this.schedule(nextIndex, snapshot);
      this.replay(nextIndex, snapshot, cause);
      return;
    }

    // Sync the index before React commits so a same-tick concurrent caller
    // sees the new index and bails on the guard above.
    this.index = nextIndex;
    this.ui.setIndex(nextIndex);
    this.publishIndex(nextIndex);
  }
  schedule(
    index: number,
    snapshot: DP1Item[],
    preserveElapsed = false,
    defaults = this.defaults
  ): void {
    this.clearTimer();

    if (!snapshot.length) {
      return;
    }
    const normalizedIndex = normalizePlaylistIndex(index, snapshot.length);
    // Consume the one-shot unconditionally: it describes exactly one arm, and
    // leaving it set would apply it to whatever slot armed next.
    const pendingPreserve = this.preserveArmFor;
    this.preserveArmFor = null;
    const preserve =
      preserveElapsed ||
      (pendingPreserve !== null &&
        pendingPreserve === itemIdentityFor(snapshot, normalizedIndex));
    if (!preserve) {
      this.slotStartedAt = Date.now();
      this.armed = null;
    }

    const currentItem = snapshot[normalizedIndex];

    // Device-level default duration (viewer override): applied only once
    // this slot's fully merged display preference — including the async
    // ref-manifest layer — is known, so a manifest-carried
    // userOverrides.duration=false (artist veto) or loop=false (natural length) can
    // never be beaten to the timer by a slow fetch. Until the merge lands
    // the item's own duration stands; the re-arm effect below reschedules
    // with the override the moment the merge resolves. The cached read is
    // safe here: updateDefaultDuration republishes castInfo, which re-runs
    // this scheduling path after the cache is already set.
    const mergedDisplay = mergedDisplayForSlot(
      this.ports.readMergedDisplay(),
      currentItem,
      normalizedIndex
    );
    const deviceDefault = DeviceManager.getCachedDefaultItemDurationSeconds();
    if (
      shouldHoldForPendingMerge({
        item: currentItem,
        mergedDisplay,
        deviceDefaultDurationSeconds: deviceDefault,
      })
    ) {
      return;
    }
    const duration = resolveSlotDurationSeconds({
      item: currentItem,
      playlistDefaults: defaults,
      deviceDefaultDurationSeconds: mergedDisplay ? deviceDefault : null,
      mergedDisplay,
    });
    if (duration <= 0 || duration >= NO_DURATION_VALUE) {
      return;
    }

    // A merge-landed re-arm must not grant a fresh interval when it does
    // not change the pacing. Two cases: the re-arm resolves to the
    // duration already armed (a re-merge that changed only display
    // fields, e.g. the device scaling record landing late) — keep the
    // armed deadline itself; or it resolves to the item's own duration
    // (the override was withheld — artist veto or no default) — the
    // artwork has been on screen since slot entry, so schedule only the
    // remaining time. A re-arm that changes the effective duration
    // restarts from zero (the override just arrived, or the owner changed
    // the pacing).
    const remainingMs =
      preserve && this.armed?.duration === duration
        ? Math.max(this.armed.deadline - Date.now(), 0)
        : null;
    const keepElapsed =
      preserve && duration === (currentItem.duration ?? NO_DURATION_VALUE);
    const delayMs =
      remainingMs ??
      Math.max(
        duration * 1000 - (keepElapsed ? Date.now() - this.slotStartedAt : 0),
        0
      );
    this.armed = { duration, deadline: Date.now() + delayMs };

    this.timer = setTimeout(() => {
      // The timeout is firing now, so the previous handle is no longer active.
      // Clearing it lets later loop-mode changes detect a true "held on final
      // artwork" state after repeat-off stops progression.
      this.timer = undefined;
      this.advance(normalizedIndex, snapshot);
    }, delayMs);
  }
  sourceEnded = (endedIdentity: string) => {
    const idx = this.index;
    const snapshot = this.items;
    if (idx < 0 || !snapshot.length) {
      return;
    }
    const normalizedIndex = normalizePlaylistIndex(idx, snapshot.length);
    if (itemIdentityFor(snapshot, normalizedIndex) !== endedIdentity) {
      return;
    }
    this.advance(normalizedIndex, snapshot, 'sourceEnd');
  };
  artworkExhausted = (failedIdentity: string) => {
    const idx = this.index;
    const snapshot = this.items;
    if (idx < 0 || !snapshot.length) {
      return;
    }
    const normalizedIndex = normalizePlaylistIndex(idx, snapshot.length);
    if (itemIdentityFor(snapshot, normalizedIndex) !== failedIdentity) {
      return;
    }
    this.advance(normalizedIndex, snapshot, 'sourceEnd', true);
  };
  acceptCast(castInfo: CastInfo | null) {
    if (!castInfo) {
      this.clearTimer();
      this.holding = false;
      this.loop = LoopMode.playlist;
      this.clearPlayable();
      return;
    }
    switch (castInfo.castCommand) {
      case CastCommand.displayPlaylist:
        this.display(castInfo);
        break;
      case CastCommand.refreshPlaylist:
      case CastCommand.setShuffle:
        this.replaceQueued(castInfo);
        break;
      case CastCommand.refreshArtwork:
        this.ports.triggerArtworkRefresh();
        break;
      case CastCommand.moveToArtwork:
      case CastCommand.updateIndex:
        this.move(castInfo);
        break;
      case CastCommand.updateDefaultDuration:
        this.schedule(this.index, this.items);
        break;
      case CastCommand.updateSeriesPlayback:
        this.rebuildForSeriesOverride(castInfo);
        break;
      case CastCommand.setLoop:
        this.changeLoop(castInfo);
        break;
    }
  }
  private display(castInfo: CastInfo) {
    this.holding = false;
    this.ports.clearMergedDisplayForNewCast();
    this.loop = coerceLoopMode(castInfo.loopMode);
    if (castInfo.playlist?.items?.length) {
      this.ui.setDefaults(castInfo.playlist.defaults ?? null);
      const rawItems = castInfo.playlist.items;
      // Narrows any seriesRegistry item or expanded series group per the
      // item's own intent and the device override before this becomes the
      // playable list.
      const { items, mapIndex } = narrowForDevice(rawItems);
      this.narrowedWith = DeviceManager.getCachedSeriesPlayback();
      this.ui.setPlaylist(
        items.map(item => ({
          ...item,
          duration: item.duration ?? NO_DURATION_VALUE,
        }))
      );
      const rawStartIndex = normalizePlaylistIndex(
        castInfo.index ?? 0,
        rawItems.length
      );
      this.ui.setIndex(
        normalizePlaylistIndex(mapIndex(rawStartIndex), items.length)
      );
    } else {
      this.clearPlayable();
    }
  }
  private replaceQueued(castInfo: CastInfo) {
    if (castInfo.playlist?.items?.length) {
      // See isSourceReplacement: a same-id source swap must hand over now.
      const rawIncoming = castInfo.playlist.items;
      const { items: incoming, mapIndex } = narrowForDevice(rawIncoming);
      if (
        isSourceReplacement(
          this.items[normalizePlaylistIndex(this.index, this.items.length)],
          incoming
        )
      ) {
        this.ui.setDefaults(castInfo.playlist.defaults ?? null);
        this.ui.setPlaylist(
          incoming.map(dp1Item => ({
            ...dp1Item,
            duration: dp1Item.duration ?? NO_DURATION_VALUE,
          }))
        );
        // Canvas remaps the selection by id, so a refresh that also
        // reorders moves it. Installing the list without the resolved
        // index would render one work while the controller reports another.
        // The index is mirrored synchronously, the way every other index
        // handoff in this file does, so a same-tick reader is not stale.
        const rawResolvedIndex = normalizePlaylistIndex(
          castInfo.index ?? 0,
          rawIncoming.length
        );
        const resolvedIndex = normalizePlaylistIndex(
          mapIndex(rawResolvedIndex),
          incoming.length
        );
        this.index = resolvedIndex;
        this.ui.setIndex(resolvedIndex);
        canvasService.clearQueuedPlaylistPending();
        return;
      }
      if (
        shouldApplyQueuedPlaylistOnShuffleOrRefresh({
          currentIndex: this.index,
          playlistLength: this.items.length,
          hasQueuedPlaylistPending: canvasService.hasQueuedPlaylistPending(),
          holdAfterFinalSlot: this.holding,
        })
      ) {
        this.applyQueued(castInfo.index);
      }
      return;
    }

    this.holding = false;
    this.clearTimer();
    this.clearPlayable();
  }
  private move(castInfo: CastInfo) {
    if (castInfo.index === undefined) {
      return;
    }

    if (canvasService.hasQueuedPlaylistPending()) {
      const queuedResult = this.applyQueued(castInfo.index);
      if (queuedResult.applied) {
        return;
      }
    }

    this.holding = false;
    if (castInfo.playlist?.items?.length) {
      const rawItems = castInfo.playlist.items;
      const { items, mapIndex } = narrowForDevice(rawItems);
      const rawIndex = normalizePlaylistIndex(castInfo.index, rawItems.length);
      this.ui.setIndex(
        normalizePlaylistIndex(mapIndex(rawIndex), items.length)
      );
    } else {
      this.ui.setIndex(castInfo.index);
    }
  }
  /**
   * Rebuilds the playable list after the device series-playback override
   * changed, and resumes a repeat-off hold the rebuild has outgrown.
   */
  private rebuildForSeriesOverride(castInfo: CastInfo) {
    const rawItems = castInfo.playlist?.items;
    if (!rawItems?.length) {
      return;
    }
    const { nextPlaylist, nextIndex, holdOutcome, preserveActiveDeadline } =
      resolveSeriesOverrideRebuild({
        rawItems,
        previousOverride: this.narrowedWith,
        previousPlaylist: this.items,
        previousIndex: this.index,
        holdAfterFinalSlot: this.holding,
      });
    this.narrowedWith = DeviceManager.getCachedSeriesPlayback();
    if (holdOutcome !== 'keep') {
      this.holding = false;
    }
    this.preserveArmFor = preserveActiveDeadline
      ? itemIdentityFor(nextPlaylist, nextIndex)
      : null;
    this.ui.setPlaylist(nextPlaylist);
    this.index = nextIndex;
    this.ui.setIndex(nextIndex);
    if (holdOutcome === 'resume') {
      // Expansion added editions after the ended item, so the playlist is
      // unfinished again — but the showing is unchanged, so the player
      // neither remounts nor reloads and the source would stay ended
      // forever. Same pair setLoop uses to leave repeat-off: the reload
      // restarts the media (a no-duration source then drives its own
      // advance into the new editions), and the timer is re-armed for a
      // finite-duration slot.
      this.ports.reload();
      this.schedule(nextIndex, nextPlaylist);
    }
  }
  private changeLoop(castInfo: CastInfo) {
    const nextLoopMode = coerceLoopMode(castInfo.loopMode);
    const activePlaylist = this.items;
    const shouldResume = shouldResumeSlotTimerAfterSetLoop({
      nextLoopMode,
      holdAfterFinalSlot: this.holding,
      currentIndex: this.index,
      playlistLength: activePlaylist.length,
    });

    this.loop = nextLoopMode;

    if (shouldResume) {
      // Leaving repeat-off restarts the held artwork. Restart media
      // unconditionally: a finite-duration video paused at end-frame
      // (loop=false) resumes via the reload; a no-duration video
      // restarts and the next end-of-stream drives advance; images
      // and HTML reload but render the same frame. Then re-arm the
      // duration timer for time-based loops.
      this.holding = false;
      this.ports.reload();
      this.schedule(this.index, activePlaylist);
    }
  }
}
