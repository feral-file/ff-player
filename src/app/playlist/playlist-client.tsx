/* eslint-disable max-lines -- playback orchestration is intentionally co-located. */
'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import TombstoneOverlay from '@/components/tombstone/TombstoneOverlay';
import { useAppContext } from '@/context/AppContext';
import { useTombstone } from './useTombstone';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { NO_DURATION_VALUE } from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { allowsContent, parseContentContext } from '@/services/contentPolicy';
import { permitsCurrentPreview } from '@/services/contentRendering';
import { useArtworkRefreshBridge } from './useArtworkRefreshBridge';
import { isSourceReplacement } from './sourceReplacement';
import { usePlayableList } from './usePlayableList';
import { useContentPolicy } from '@/services/custom-hooks/useContentPolicy';
import { policyInForce } from '@/services/ContentPolicyStore';
import {
  isNoDurationItem,
  itemIdentityFor,
  mergedDisplayForSlot,
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  resolveSlotDurationSeconds,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldHoldForPendingMerge,
  shouldResumeSlotTimerAfterSetLoop,
} from '@/utils/playlist';
import DeviceManager from '@/utils/DeviceManager';
import { coerceLoopMode } from '@/utils/loopMode';
import { narrowSeriesPlaylist } from '@/utils/seriesPlayback';
import { useCurrentItemIdentity, useShowingKey } from './useCurrentItemIdentity';
import { useMergeLandedRearm } from './useMergeLandedRearm';
import { usePlaylistItemDisplayPreference } from './usePlaylistItemDisplayPreference';
import { useRecentlyPlayedCommit } from './useRecentlyPlayedCommit';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// 'sourceEnd' means the media just ended (display.loop=false) and needs a
// reload to restart playback; 'timer' lets the natively-looping element
// keep playing on the same-slot replay paths.
type AdvanceCause = 'timer' | 'sourceEnd';

/** Effective duration and wall-clock deadline of the armed slot timer. */
interface ArmedInterval { duration: number; deadline: number }

// eslint-disable-next-line max-lines-per-function
export default function PlaylistClient() {
  const castInfo = useAppContext().context.castInfo;
  const deviceDisplaySettings = useAppContext().context.displaySettings;
  const contentPolicy = useContentPolicy();
  const contentContext = parseContentContext(castInfo?.contentContext);

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  // Preview URL and the item that owns it are published together by the
  // bridge, so the final media gate never sees one without the other.
  const { artworkPerformReloadRef, triggerArtworkRefresh, registerArtworkReload,
    getShowing, publishPreview, notePreviewCommitted, retireCommittedIfGone,
    clearPreview } =
    useArtworkRefreshBridge(setCastPreviewURL, identity => {
      handleItemCommittedRef.current(identity);
    });
  const handleItemCommittedRef = useRef<(identity: string) => void>(() => undefined);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  // The interval the active slot's timer is armed with — effective duration
  // and wall-clock deadline — so a re-arm that resolves to the same pacing
  // keeps the real deadline (not one measured from slot entry, which a slot
  // held pre-merge only started counting after its first arm).
  const armedRef = useRef<ArmedInterval | null>(null);
  // Wall-clock moment the active slot last (re)started, so a merge-landed
  // re-arm can preserve elapsed time for baseline durations instead of
  // granting a vetoed item a fresh full interval.
  const slotStartedAtRef = useRef<number>(0);
  const currentItemRef = useRef<DP1Item>();
  const currentIndexRef = useRef<number>(-1);
  const playlistRef = useRef<DP1Item[]>([]);
  const playlistLengthRef = useRef<number>(0);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);
  const holdAfterFinalSlotRef = useRef(false);

  currentIndexRef.current = currentIndex;
  playlistRef.current = playlist;
  playlistLengthRef.current = playlist.length;

  const {
    preference: currentItemDisplayPreference,
    mergedDisplayRef: mergedDisplayForItemRef,
    resolveForSlot: handleItemDisplayPreference,
    clearMergedDisplayForNewCast,
    clearMergedDisplay,
    reset: resetItemDisplayPreference,
  } = usePlaylistItemDisplayPreference({
    playlistDefaults: playlistDefaultsSettings,
    deviceDisplaySettings,
    currentItemRef,
    currentIndexRef,
    playlistRef,
  });

  const clearPlayableList = usePlayableList({ currentItemRef, setPlaylist,
    setCurrentIndex, setPlaylistDefaultsSettings, resetItemDisplayPreference,
    clearPreview });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  // Same-slot loops park on the end frame either when there's no duration
  // (timer is a no-op) or when display.loop=false has already fired `ended`.
  // Under display.loop=true the element loops natively, so cause='timer'
  // skips the reload.
  const replayCurrentSlot = useCallback(
    (index: number, snapshot: DP1Item[], cause: AdvanceCause): void => {
      if (!snapshot.length) {
        return;
      }
      const item = snapshot[normalizePlaylistIndex(index, snapshot.length)];
      if (cause === 'sourceEnd' || isNoDurationItem(item)) {
        artworkPerformReloadRef.current?.();
      }
    },
    [artworkPerformReloadRef]
  );

  useLayoutEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      currentItemRef.current = undefined;
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(currentIndex, playlist.length);
    currentItemRef.current = playlist[normalizedIndex];
  }, [currentIndex, playlist]);

  // Same-tick dedupe of index transitions lives with the cast state owner.
  //
  // `index` is in LOCAL space: a position in `playlistRef.current`, which a
  // series override can narrow to fewer slots than `castInfo.playlist.items`
  // (run-reviewer F1, round 2). CanvasService's own castInfo.index is never
  // narrowed — moveToArtwork, getStatus, and every other reader of it expect
  // a RAW position into castInfo.playlist.items — so publishing the local
  // index unchanged would, the moment a narrowed series group sits anywhere
  // but the very start, desync the two and corrupt the next re-render's own
  // `moveToArtwork`/`updateIndex` narrowing (which re-maps castInfo.index as
  // raw). `rawIndexOf` resolves it by construction, not by id: two raw items
  // can legitimately share an id (the same artwork twice in one playlist),
  // which an id lookup cannot tell apart (run-reviewer F1, round 2's own
  // fix attempt regressed exactly that case) but this never confuses.
  const publishCurrentIndex = useCallback((index: number) => {
    const rawItems = canvasService.getCastInfo()?.playlist?.items;
    if (!rawItems?.length) {
      canvasService.publishIndexUpdate(index);
      return;
    }
    const { rawIndexOf } = narrowSeriesPlaylist(
      rawItems, DeviceManager.getCachedSeriesPlayback());
    canvasService.publishIndexUpdate(rawIndexOf(index));
  }, []);

  const applyQueuedPlaylistIfExists = useCallback(
    (targetIndex?: number, keepCurrent = false): { applied: boolean } => {
      if (!canvasService.hasQueuedPlaylistPending()) {
        return { applied: false };
      }

      // Items are owned by CanvasService — no duplicate storage needed.
      const queuedPlaylist = canvasService.getQueuedPlaylistItems();
      if (!queuedPlaylist?.length) {
        canvasService.clearQueuedPlaylistPending();
        return { applied: false };
      }

      holdAfterFinalSlotRef.current = false;
      // Queued refresh/shuffle replaces the item list; same-id items may
      // carry changed display fields, so the cached merge cannot be trusted.
      clearMergedDisplay();

      const hasDeferredRefresh = canvasService.hasDeferredRefreshPlaylist();
      const currentCastInfo = canvasService.getCastInfo();
      // The playable list is narrowed here — the one call site this file's
      // own series-playback cascade had missed (run-reviewer F2, round 2).
      const { items: narrowedQueued, mapIndex, rawIndexOf } =
        narrowSeriesPlaylist(
          queuedPlaylist,
          DeviceManager.getCachedSeriesPlayback()
        );

      // Which space the next index is resolved in depends on where it came
      // from, and the two cannot share one call:
      //
      // - A `targetIndex` is a RAW position — a controller's castInfo.index,
      //   remapped onto the new raw list when the refresh was deferred. It is
      //   resolved against `queuedPlaylist` and carried across with
      //   `mapIndex`, the pattern every other cast-command branch uses.
      // - A natural advance (no targetIndex) has to step through the list the
      //   viewer actually sees. Resolved in raw space, the successor of the
      //   item on screen is the next EDITION of its own collapsed series
      //   group, which `mapIndex` sends straight back to the slot already
      //   showing — so each queued refresh replays the same item and playback
      //   never leaves the group (feralfile-bot F3, bot round 4). Resolving
      //   against `narrowedQueued` steps to the group's successor instead.
      //   `keepCurrent` belongs in the same space for the same reason:
      //   `currentItemRef` holds an item of the NARROWED list, so that is
      //   where its id is looked up.
      const narrowedIndex = normalizePlaylistIndex(
        targetIndex === undefined
          ? resolveQueuedPlaylistNextIndex({
              queuedPlaylist: narrowedQueued,
              currentItemId: currentItemRef.current?.id,
              keepCurrent,
            })
          : mapIndex(
              resolveQueuedPlaylistNextIndex({
                targetIndex,
                queuedPlaylist,
                previousItems: currentCastInfo?.playlist?.items,
                hasDeferredRefresh,
              })
            ),
        narrowedQueued.length
      );
      // Everything that reads castInfo.index — moveToArtwork, getStatus,
      // triggerArtworkRefresh — expects RAW space, which CanvasService never
      // narrows, so the selected slot is translated back exactly once here.
      // `rawIndexOf` is the inverse of the traversal that built
      // `narrowedQueued`, so it names the raw position of the item that
      // actually plays rather than the one the command happened to ask for.
      const rawNextIndex = rawIndexOf(narrowedIndex);

      setPlaylist(narrowedQueued);
      setCurrentIndex(narrowedIndex);
      // Sync refs immediately so a same-tick concurrent caller sees the
      // new state instead of re-entering against the old snapshot.
      playlistRef.current = narrowedQueued;
      playlistLengthRef.current = narrowedQueued.length;
      currentIndexRef.current = narrowedIndex;

      // consumeDeferredRefreshPlaylist atomically promotes the deferred refresh
      // onto castInfo so getStatus reflects the new list from the first frame.
      // Queued refresh/shuffle only changes playlist items and index; defaults
      // stay owned by the active playlist contract and are intentionally left as-is.
      // This takes the RAW index: castInfo.playlist/castInfo.index are never
      // narrowed (see publishCurrentIndex above for why that has to hold).
      const consumed =
        canvasService.consumeDeferredRefreshPlaylist(rawNextIndex);
      if (!consumed) {
        canvasService.clearQueuedPlaylistPending();
        publishCurrentIndex(narrowedIndex);
      }

      return { applied: true };
    },
    [clearMergedDisplay, publishCurrentIndex]
  );

  // Advance away from the slot at `fromIndex`. Shared by the duration-based
  // timer (scheduleCurrentItemTimer) and the source-end callback that fires
  // when a time-based item finishes naturally (display.loop=false). Per DP-1
  // §4.1, when both triggers exist, whichever fires first wins; the guard
  // against the current index keeps a late second trigger from advancing
  // again after the slot has already moved.
  const advanceFromSlot = useCallback(
    function advanceFromSlot(
      fromIndex: number,
      snapshot: DP1Item[],
      cause: AdvanceCause = 'timer',
      retryOnFinalHold = false
    ): void {
      if (!snapshot.length) {
        return;
      }
      if (currentIndexRef.current !== fromIndex) {
        return;
      }

      clearTimer();
      holdAfterFinalSlotRef.current = false;

      if (loopModeRef.current === LoopMode.one) {
        // keepCurrent=true keeps loop on this artwork after a queued
        // refresh; falls back to index 0 if the item was removed.
        if (applyQueuedPlaylistIfExists(undefined, true).applied) {
          // Same-id same-source queued refresh leaves previewURL/identity
          // unchanged, so ArtworkPlayer does not recreate the slot.
          // Restart playback if the source ended or has no duration.
          replayCurrentSlot(
            currentIndexRef.current, playlistRef.current, cause
          );
          return;
        }
        publishCurrentIndex(fromIndex);
        scheduleCurrentItemTimer(fromIndex, snapshot);
        replayCurrentSlot(fromIndex, snapshot, cause);
        return;
      }

      const queuedResult = applyQueuedPlaylistIfExists();
      if (queuedResult.applied) {
        replayCurrentSlot(
          currentIndexRef.current, playlistRef.current, cause
        );
        return;
      }

      const nextIndex = resolveSequentialPlaylistAdvance({
        currentIndex: fromIndex,
        playlistLength: snapshot.length,
        loopMode: loopModeRef.current,
      });
      if (nextIndex === null) {
        // Repeat-off holds the final artwork on screen until another command
        // changes playback. Do not wrap or reschedule from this slot — unless
        // the caller is reporting a FAILURE (retryOnFinalHold), not a natural
        // end: there is nothing to skip to here, so retry in place instead of
        // parking on the error modal forever (run-reviewer pass 4, F2). The
        // applyQueuedPlaylistIfExists() call above already ran before this
        // branch, so a queued refresh/shuffle still takes over exactly as it
        // would for any other advance — this only changes what happens when
        // none is pending.
        if (
          loopModeRef.current === LoopMode.none &&
          fromIndex === snapshot.length - 1
        ) {
          if (retryOnFinalHold) {
            // Same end state as the natural-end branch below (nothing to
            // skip to, held on this slot) — flag it the same way, or a
            // later setLoop-away-from-none / queued shuffle-refresh, both
            // gated on this flag (shouldResumeSlotTimerAfterSetLoop /
            // shouldApplyQueuedPlaylistOnShuffleOrRefresh in
            // src/utils/playlist.ts), is silently dropped forever for this
            // one item once the retry eventually succeeds — nothing else
            // ever calls advanceFromSlot again for a no-duration item with
            // no further timer armed (run-reviewer bot-round-3 pass-5 F1,
            // Major).
            holdAfterFinalSlotRef.current = true;
            replayCurrentSlot(fromIndex, snapshot, cause);
            return;
          }
          holdAfterFinalSlotRef.current = true;
        }
        return;
      }

      // Single-item playlist: nextIndex wraps back to the same position.
      // setCurrentIndex would be a no-op and React would not re-run the
      // scheduling effect. Reschedule directly to keep the loop alive.
      if (nextIndex === fromIndex) {
        publishCurrentIndex(nextIndex);
        scheduleCurrentItemTimer(nextIndex, snapshot);
        replayCurrentSlot(nextIndex, snapshot, cause);
        return;
      }

      // Sync the ref before React commits so a same-tick concurrent caller
      // sees the new index and bails on the guard above.
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      publishCurrentIndex(nextIndex);
    },
    // scheduleCurrentItemTimer is hoisted later via function declaration; the
    // ref-based pattern (currentIndexRef, etc.) keeps the dep set minimal and
    // avoids a circular useCallback dependency between advance and schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyQueuedPlaylistIfExists, clearTimer, publishCurrentIndex]
  );

  const scheduleCurrentItemTimer = useCallback(
    function scheduleCurrentItemTimer(
      index: number,
      snapshot: DP1Item[],
      preserveElapsed = false
    ): void {
      clearTimer();

      if (!snapshot.length) {
        return;
      }
      if (!preserveElapsed) {
        slotStartedAtRef.current = Date.now();
        armedRef.current = null;
      }

      const normalizedIndex = normalizePlaylistIndex(index, snapshot.length);
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
        mergedDisplayForItemRef.current,
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
        playlistDefaults: playlistDefaultsSettings,
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
        preserveElapsed && armedRef.current?.duration === duration
          ? Math.max(armedRef.current.deadline - Date.now(), 0)
          : null;
      const keepElapsed =
        preserveElapsed &&
        duration === (currentItem.duration ?? NO_DURATION_VALUE);
      const delayMs =
        remainingMs ??
        Math.max(
          duration * 1000 -
            (keepElapsed ? Date.now() - slotStartedAtRef.current : 0),
          0
        );
      armedRef.current = { duration, deadline: Date.now() + delayMs };

      timerRef.current = setTimeout(() => {
        // The timeout is firing now, so the previous handle is no longer active.
        // Clearing it lets later loop-mode changes detect a true "held on final
        // artwork" state after repeat-off stops progression.
        timerRef.current = undefined;
        advanceFromSlot(normalizedIndex, snapshot);
      }, delayMs);
    },
    [
      advanceFromSlot,
      clearTimer,
      mergedDisplayForItemRef,
      playlistDefaultsSettings,
    ]
  );

  // Triggered by ArtworkPlayer when a time-based source (video or audio) ends
  // naturally. Per DP-1 §4.1, end-of-stream advances the playlist when
  // display.loop is false. The HTML5 media element does not emit `ended`
  // while loop=true, so this only fires for items where advance-on-source-end
  // is actually requested.
  //
  // `endedIdentity` is the firing slot's itemIdentity. If it no longer
  // matches the current item's identity, the slot has already moved on
  // (e.g. a duration timer beat the source-end event to the advance, or the
  // previous slot fired a late `ended` from an adjacent same-URL item).
  // ArtworkPlayer gates events at the slot level too; this is a second line
  // of defense against the rare interleaving where both fire before React
  // commits the index update.
  const handleSourceEnded = useCallback((endedIdentity: string) => {
    const idx = currentIndexRef.current;
    const snapshot = playlistRef.current;
    if (idx < 0 || !snapshot.length) {
      return;
    }
    const normalizedIndex = normalizePlaylistIndex(idx, snapshot.length);
    if (itemIdentityFor(snapshot, normalizedIndex) !== endedIdentity) {
      return;
    }
    advanceFromSlot(normalizedIndex, snapshot, 'sourceEnd');
  }, [advanceFromSlot]);

  // Triggered by ArtworkPlayer once a work has failed to render
  // ARTWORK_FAILURE_RETRY_LIMIT times in a row (feral-file/ff-player#307): a
  // stuck/broken work must not hold the playlist (or the device) forever.
  // Reuses advanceFromSlot's 'sourceEnd' cause — the same identity-gated
  // advance onSourceEnded drives — so a normal playlist/shuffle loop moves
  // to the next item exactly as it would for natural end-of-stream. Under
  // LoopMode.one this instead reloads the same (still looped-on-purpose)
  // item via replayCurrentSlot, which is deliberate: the curator/user asked
  // to loop this one work, so giving up on it entirely would override that
  // choice rather than honor it; the retry still cannot hang the device
  // (see the HEAD-probe timeout in src/utils/helper.ts).
  //
  // LoopMode.none at the final (or only) slot is the one other case
  // advanceFromSlot cannot skip from: resolveSequentialPlaylistAdvance
  // returns null there, and the plain hold-the-last-frame branch it takes
  // is meant for a *successful* natural end, not a failure ArtworkPlayer
  // already gave up retrying on. Reusing it for exhaustion would park the
  // device on the error modal forever with no further attempt (run-reviewer
  // pass 4, F2) — so advanceFromSlot's own null-nextIndex branch retries in
  // place instead when told this call is a failure (retryOnFinalHold=true),
  // mirroring LoopMode.one's "keep trying" treatment for the one case where
  // "skipped" has no target. This goes through advanceFromSlot rather than
  // calling replayCurrentSlot directly (an earlier version of this fix did,
  // and run-reviewer pass 5 F1/F2 independently caught that it skipped
  // applyQueuedPlaylistIfExists — a shuffle/refresh command sent while the
  // final item is stuck retrying would silently never apply): going through
  // advanceFromSlot keeps that check exactly as every other advance gets it.
  // Still bounded/paced, not a tight loop: ArtworkPlayer resets its own
  // retry budget before calling out, so each cycle gets the same 3-attempt,
  // 3s-apart budget as every other failure.
  const handleArtworkExhausted = useCallback((failedIdentity: string) => {
    const idx = currentIndexRef.current;
    const snapshot = playlistRef.current;
    if (idx < 0 || !snapshot.length) {
      return;
    }
    const normalizedIndex = normalizePlaylistIndex(idx, snapshot.length);
    if (itemIdentityFor(snapshot, normalizedIndex) !== failedIdentity) {
      return;
    }
    advanceFromSlot(normalizedIndex, snapshot, 'sourceEnd', true);
  }, [advanceFromSlot]);

  useEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      holdAfterFinalSlotRef.current = false;
      clearTimer();
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(currentIndex, playlist.length);
    const currentItem = playlist[normalizedIndex];

    // The final media gate is not enough: do not fetch a blocked work's ref
    // manifest while its slot is hidden or while policy hydration is pending.
    const inForce = policyInForce(contentPolicy);
    if (!inForce || !allowsContent(currentItem, inForce, contentContext)) {
      clearTimer();
      clearPreview();
      return;
    }
    // A policy change can retire the work on screen while this selected one
    // stays allowed; the gate would otherwise keep judging the retired work
    // and never let its replacement mount.
    retireCommittedIfGone(onScreen => allowsContent(
      onScreen, inForce, contentContext));
    void handleItemDisplayPreference(currentItem, normalizedIndex);
    publishPreview(currentItem);
    scheduleCurrentItemTimer(normalizedIndex, playlist);

    return () => {
      clearTimer();
    };
  }, [
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearTimer,
    clearPreview,
    publishPreview,
    retireCommittedIfGone,
    handleItemDisplayPreference,
    scheduleCurrentItemTimer,
    contentContext,
    contentPolicy,
  ]);

  useMergeLandedRearm({
    preference: currentItemDisplayPreference,
    currentIndexRef,
    playlistRef,
    scheduleCurrentItemTimer,
  });

  // eslint-disable-next-line max-lines-per-function
  useEffect(() => {
    if (!castInfo) {
      clearTimer();
      holdAfterFinalSlotRef.current = false;
      loopModeRef.current = LoopMode.playlist;
      clearPlayableList();
      return;
    }

    switch (castInfo.castCommand) {
      case CastCommand.displayPlaylist: {
        holdAfterFinalSlotRef.current = false;
        clearMergedDisplayForNewCast();
        loopModeRef.current = coerceLoopMode(castInfo.loopMode);
        if (castInfo.playlist?.items?.length) {
          setPlaylistDefaultsSettings(castInfo.playlist.defaults ?? null);
          const rawItems = castInfo.playlist.items;
          const rawIndex = normalizePlaylistIndex(
            castInfo.index ?? 0,
            rawItems.length
          );
          // Narrows any seriesRegistry item/expanded series group per the
          // item's own intent and the device override (resolveSeriesPlayback)
          // before this becomes the playable list — see narrowSeriesPlaylist.
          const { items: narrowedItems, mapIndex } = narrowSeriesPlaylist(
            rawItems,
            DeviceManager.getCachedSeriesPlayback()
          );
          setPlaylist(
            narrowedItems.map(item => ({
              ...item,
              duration: item.duration ?? NO_DURATION_VALUE,
            }))
          );
          setCurrentIndex(
            normalizePlaylistIndex(mapIndex(rawIndex), narrowedItems.length)
          );
        } else {
          clearPlayableList();
        }
        break;
      }

      case CastCommand.refreshPlaylist:
      case CastCommand.setShuffle: {
        if (castInfo.playlist?.items?.length) {
          // See isSourceReplacement: a same-id source swap must hand over now.
          const rawIncoming = castInfo.playlist.items;
          const { items: incoming, mapIndex } = narrowSeriesPlaylist(
            rawIncoming,
            DeviceManager.getCachedSeriesPlayback()
          );
          if (isSourceReplacement(playlistRef.current[normalizePlaylistIndex(
            currentIndexRef.current, playlistRef.current.length)], incoming)) {
            setPlaylistDefaultsSettings(castInfo.playlist.defaults ?? null);
            setPlaylist(incoming.map(dp1Item => ({
              ...dp1Item,
              duration: dp1Item.duration ?? NO_DURATION_VALUE,
            })));
            // Canvas remaps the selection by id, so a refresh that also
            // reorders moves it. Installing the list without the resolved
            // index would render one work while the controller reports another.
            // The ref is mirrored synchronously, the way every other index
            // handoff in this file does, so a same-tick reader is not stale.
            const rawResolvedIndex = normalizePlaylistIndex(
              castInfo.index ?? 0, rawIncoming.length);
            const resolvedIndex = normalizePlaylistIndex(
              mapIndex(rawResolvedIndex), incoming.length);
            currentIndexRef.current = resolvedIndex;
            setCurrentIndex(resolvedIndex);
            canvasService.clearQueuedPlaylistPending();
            break;
          }
          if (
            shouldApplyQueuedPlaylistOnShuffleOrRefresh({
              currentIndex: currentIndexRef.current,
              playlistLength: playlistLengthRef.current,
              hasQueuedPlaylistPending:
                canvasService.hasQueuedPlaylistPending(),
              holdAfterFinalSlot: holdAfterFinalSlotRef.current,
            })
          ) {
            applyQueuedPlaylistIfExists(castInfo.index);
          }
          break;
        }

        holdAfterFinalSlotRef.current = false;
        clearTimer();
        clearPlayableList();
        break;
      }

      case CastCommand.refreshArtwork: {
        triggerArtworkRefresh();
        break;
      }

      case CastCommand.moveToArtwork:
      case CastCommand.updateIndex: {
        if (castInfo.index === undefined) {
          break;
        }

        if (canvasService.hasQueuedPlaylistPending()) {
          const queuedResult = applyQueuedPlaylistIfExists(castInfo.index);
          if (queuedResult.applied) {
            break;
          }
        }

        holdAfterFinalSlotRef.current = false;
        if (castInfo.playlist?.items?.length) {
          const rawItems = castInfo.playlist.items;
          const { items: narrowedItems, mapIndex } = narrowSeriesPlaylist(
            rawItems,
            DeviceManager.getCachedSeriesPlayback()
          );
          const rawIndex = normalizePlaylistIndex(
            castInfo.index,
            rawItems.length
          );
          setCurrentIndex(
            normalizePlaylistIndex(mapIndex(rawIndex), narrowedItems.length)
          );
        } else {
          setCurrentIndex(castInfo.index);
        }
        break;
      }

      case CastCommand.updateDefaultDuration: {
        // The device default duration changed. Re-arm the active slot's
        // timer so the new value applies to the artwork currently on screen
        // without restarting playback. The full interval restarts from now —
        // deliberately simple; elapsed-time credit is not worth the state.
        // Repeat-off hold is preserved: re-arming on the held final slot just
        // schedules an advance that resolveSequentialPlaylistAdvance turns
        // into another hold.
        scheduleCurrentItemTimer(
          currentIndexRef.current,
          playlistRef.current
        );
        break;
      }

      case CastCommand.updateSeriesPlayback: {
        // The device series-playback override changed. Unlike duration, the
        // override can change WHICH items play (First collapses an expanded
        // series to one edition; Full restores every edition it narrowed
        // away), so the playable list itself is rebuilt here — always from
        // castInfo.playlist.items, which CanvasService never narrows or
        // mutates, so toggling the override back and forth stays reversible
        // without a re-cast (see narrowSeriesPlaylist). The slot carrying the
        // item currently on screen is tracked by id, since a First<->Full
        // flip changes the array's length and positions.
        if (castInfo.playlist?.items?.length) {
          holdAfterFinalSlotRef.current = false;
          const rawItems = castInfo.playlist.items;
          const { items: narrowedItems, mapIndex } = narrowSeriesPlaylist(
            rawItems,
            DeviceManager.getCachedSeriesPlayback()
          );
          const currentId = currentItemRef.current?.id;
          const rawCurrentIndex = currentId === undefined ? 0 : Math.max(
            0, rawItems.findIndex(raw => raw.id === currentId));
          const nextIndex = normalizePlaylistIndex(
            mapIndex(rawCurrentIndex), narrowedItems.length);
          setPlaylist(
            narrowedItems.map(item => ({
              ...item,
              duration: item.duration ?? NO_DURATION_VALUE,
            }))
          );
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
        }
        break;
      }

      case CastCommand.setLoop: {
        const nextLoopMode = coerceLoopMode(castInfo.loopMode);
        const activePlaylist = playlistRef.current;
        const shouldResume = shouldResumeSlotTimerAfterSetLoop({
          nextLoopMode,
          holdAfterFinalSlot: holdAfterFinalSlotRef.current,
          currentIndex: currentIndexRef.current,
          playlistLength: activePlaylist.length,
        });

        loopModeRef.current = nextLoopMode;

        if (shouldResume) {
          // Leaving repeat-off restarts the held artwork. Restart media
          // unconditionally: a finite-duration video paused at end-frame
          // (loop=false) resumes via the reload; a no-duration video
          // restarts and the next end-of-stream drives advance; images
          // and HTML reload but render the same frame. Then re-arm the
          // duration timer for time-based loops.
          holdAfterFinalSlotRef.current = false;
          artworkPerformReloadRef.current?.();
          scheduleCurrentItemTimer(currentIndexRef.current, activePlaylist);
        }
        break;
      }
    }
  }, [
    applyQueuedPlaylistIfExists,
    artworkPerformReloadRef,
    castInfo,
    clearMergedDisplayForNewCast,
    clearPlayableList,
    clearPreview,
    clearTimer,
    replayCurrentSlot,
    resetItemDisplayPreference,
    scheduleCurrentItemTimer,
    triggerArtworkRefresh,
  ]);

  const currentItemIdentity = useCurrentItemIdentity(playlist, currentIndex);
  const currentShowingKey = useShowingKey(playlist, currentIndex);
  const permitted = castInfo !== null && permitsCurrentPreview(
    canvasService.getCastInfo(), getShowing(), castPreviewURL, contentPolicy);

  // Tombstone state (feral-file#3452): committed-item tracking, label
  // resolution and mode coercion — see useTombstone.
  const {
    handleItemCommitted,
    mode: tombstoneMode,
    itemKey: tombstoneItemKey,
    title: tombstoneTitle,
    artistName: tombstoneArtist,
  } = useTombstone(playlist, deviceDisplaySettings);
  handleItemCommittedRef.current = handleItemCommitted;

  const handleArtworkCommitted = useRecentlyPlayedCommit(
    playlist,
    playlistDefaultsSettings,
    contentContext
  );

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {currentItemDisplayPreference && permitted && (
          <ArtworkPlayer
            key={contentPolicy.retireEpoch}
            previewURL={castPreviewURL ?? ''}
            displayPreferences={currentItemDisplayPreference}
            itemIdentity={currentItemIdentity}
            sessionKey={currentShowingKey}
            onRegisterArtworkReload={registerArtworkReload}
            onSourceEnded={handleSourceEnded}
            onArtworkExhausted={handleArtworkExhausted}
            onItemCommitted={notePreviewCommitted}
            onItemPlayed={handleArtworkCommitted}
          />
        )}
        {permitted && <TombstoneOverlay
          mode={tombstoneMode}
          itemKey={tombstoneItemKey}
          title={tombstoneTitle}
          artistName={tombstoneArtist}
          curatorName={castInfo.playlist?.curator}
        />}
      </div>
    </>
  );
}
