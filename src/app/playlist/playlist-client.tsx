'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import {
  defaultDP1DisplayPreference,
  DP1DisplayPreference,
  DP1Defaults,
  DP1Item,
} from '@/models/dp1.model';
import { NO_DURATION_VALUE } from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { DP1Service } from '@/services/DP1Service';
import {
  isNoDurationItem,
  itemIdentityFor,
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  resolveSlotDurationSeconds,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldResumeSlotTimerAfterSetLoop,
} from '@/utils/playlist';
import DeviceManager from '@/utils/DeviceManager';
import { coerceLoopMode } from '@/utils/loopMode';
import { reportPlaylistDisplayPreferenceError } from '@/utils/playlistDisplayPreference';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// 'sourceEnd' means the media just ended (display.loop=false) and needs a
// reload to restart playback; 'timer' lets the natively-looping element
// keep playing on the same-slot replay paths.
type AdvanceCause = 'timer' | 'sourceEnd';

// eslint-disable-next-line max-lines-per-function
export default function PlaylistClient() {
  const { context } = useAppContext();
  const castInfo = context.castInfo;

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentItemDisplayPreference, setCurrentItemDisplayPreference] =
    useState<DP1DisplayPreference | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const artworkPerformReloadRef = useRef<(() => void) | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const currentItemRef = useRef<DP1Item>();
  const currentIndexRef = useRef<number>(-1);
  const playlistRef = useRef<DP1Item[]>([]);
  const playlistLengthRef = useRef<number>(0);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);
  const holdAfterFinalSlotRef = useRef(false);

  currentIndexRef.current = currentIndex;
  playlistRef.current = playlist;
  playlistLengthRef.current = playlist.length;

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

  const registerArtworkReload = useCallback(
    (reload: (() => void) | null) => {
      artworkPerformReloadRef.current = reload;
    },
    []
  );

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
    []
  );

  const triggerArtworkRefresh = useCallback((): boolean => {
    const cast = canvasService.getCastInfo();
    const items = cast?.playlist?.items;
    const rawIndex = cast?.index;
    if (!items?.length || rawIndex === undefined) {
      return false;
    }

    const normalizedIndex = normalizePlaylistIndex(rawIndex, items.length);
    const currentSource = items[normalizedIndex]?.source;
    if (!currentSource) {
      return false;
    }
    const performReload = artworkPerformReloadRef.current;
    if (!performReload) {
      return false;
    }
    setCastPreviewURL(currentSource);
    performReload();
    return true;
  }, []);

  useLayoutEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      currentItemRef.current = undefined;
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(currentIndex, playlist.length);
    currentItemRef.current = playlist[normalizedIndex];
  }, [currentIndex, playlist]);

  useEffect(() => {
    canvasService.onRefreshArtwork = triggerArtworkRefresh;
    return () => {
      canvasService.onRefreshArtwork = null;
    };
  }, [triggerArtworkRefresh]);

  const handleItemDisplayPreference = useCallback(
    async (dp1Item: DP1Item) => {
      const activeItemId = dp1Item.id;
      const activeRef = dp1Item.ref;

      try {
        // 4) Playlist defaults.display (lowest priority)
        const base: DP1DisplayPreference = {
          ...defaultDP1DisplayPreference,
          ...(playlistDefaultsSettings?.display ?? {}),
        };

        // 3) Content loaded from item.ref
        let refDisplay: DP1DisplayPreference | undefined;
        try {
          if (dp1Item.ref) {
            // TODO: Implement ref hash verification
            const manifest = await DP1Service.getItemRef(dp1Item.ref);
            refDisplay = manifest?.controls?.display;
          }
        } catch (error: unknown) {
          reportPlaylistDisplayPreferenceError('getItemRef', error, {
            ref: dp1Item.ref,
            itemId: dp1Item.id,
          });
          // Ref load failed; continue merge without manifest display.
        }

        // 2) Item override.display (medium priority)
        let overriddenDisplay: DP1DisplayPreference | undefined;
        if (dp1Item.override?.display) {
          overriddenDisplay = dp1Item.override.display;
        }

        // 1) Item display (highest priority)
        const merged: DP1DisplayPreference = {
          ...base,
          ...(refDisplay ?? {}),
          ...(overriddenDisplay ?? {}),
          ...(dp1Item.display ?? {}),
        };

        const currentItem = currentItemRef.current;
        if (!currentItem) {
          return;
        }
        if (currentItem.id === activeItemId && currentItem.ref === activeRef) {
          setCurrentItemDisplayPreference(merged);
        }
      } catch (error: unknown) {
        reportPlaylistDisplayPreferenceError(
          'mergeOrApplyDisplayPreference',
          error,
          { itemId: activeItemId, ref: activeRef }
        );
        const currentItem = currentItemRef.current;
        if (!currentItem) {
          return;
        }
        if (currentItem.id === activeItemId && currentItem.ref === activeRef) {
          setCurrentItemDisplayPreference(defaultDP1DisplayPreference);
        }
      }
    },
    [playlistDefaultsSettings]
  );

  // Drops a no-op updateIndex transition (cast already at this index).
  // Collapses same-tick races where timer + onSourceEnded both publish.
  const publishCurrentIndex = useCallback((index: number) => {
    const currentCastInfo = canvasService.getCastInfo();
    if (!currentCastInfo) {
      return;
    }
    if (
      currentCastInfo.castCommand === CastCommand.updateIndex &&
      currentCastInfo.index === index
    ) {
      return;
    }

    canvasService.setCastInfo({
      ...currentCastInfo,
      castCommand: CastCommand.updateIndex,
      index,
    });
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

      const hasDeferredRefresh = canvasService.hasDeferredRefreshPlaylist();
      const currentCastInfo = canvasService.getCastInfo();
      const nextIndex = resolveQueuedPlaylistNextIndex({
        targetIndex,
        queuedPlaylist,
        previousItems: currentCastInfo?.playlist?.items,
        hasDeferredRefresh,
        currentItemId: currentItemRef.current?.id,
        keepCurrent,
      });

      setPlaylist(queuedPlaylist);
      setCurrentIndex(nextIndex);
      // Sync refs immediately so a same-tick concurrent caller sees the
      // new state instead of re-entering against the old snapshot.
      playlistRef.current = queuedPlaylist;
      playlistLengthRef.current = queuedPlaylist.length;
      currentIndexRef.current = nextIndex;

      // consumeDeferredRefreshPlaylist atomically promotes the deferred refresh
      // onto castInfo so getStatus reflects the new list from the first frame.
      // Queued refresh/shuffle only changes playlist items and index; defaults
      // stay owned by the active playlist contract and are intentionally left as-is.
      const consumed = canvasService.consumeDeferredRefreshPlaylist(nextIndex);
      if (!consumed) {
        canvasService.clearQueuedPlaylistPending();
        publishCurrentIndex(nextIndex);
      }

      return { applied: true };
    },
    [publishCurrentIndex]
  );

  // Advance away from the slot at `fromIndex`. Shared by the duration-based
  // timer (scheduleCurrentItemTimer) and the source-end callback that fires
  // when a time-based item finishes naturally (display.loop=false). Per DP-1
  // §4.1, when both triggers exist, whichever fires first wins; the guard
  // against the current index keeps a late second trigger from advancing
  // again after the slot has already moved.
  const advanceFromSlot = useCallback(
    function advanceFromSlot(
      fromIndex: number, snapshot: DP1Item[], cause: AdvanceCause = 'timer'
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
        // changes playback. Do not wrap or reschedule from this slot.
        if (
          loopModeRef.current === LoopMode.none &&
          fromIndex === snapshot.length - 1
        ) {
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
      snapshot: DP1Item[]
    ): void {
      clearTimer();

      if (!snapshot.length) {
        return;
      }

      const normalizedIndex = normalizePlaylistIndex(index, snapshot.length);
      const currentItem = snapshot[normalizedIndex];

      // Device-level default duration (viewer override) participates in the
      // resolution; resolveSlotDurationSeconds skips it for artist-vetoed
      // (userOverrides=false) and natural-length (loop=false) items. The
      // cached read is safe here: updateDefaultDuration republishes castInfo,
      // which re-runs this scheduling path after the cache is already set.
      const duration = resolveSlotDurationSeconds({
        item: currentItem,
        playlistDefaults: playlistDefaultsSettings,
        deviceDefaultDurationSeconds:
          DeviceManager.getCachedDefaultItemDurationSeconds(),
      });
      if (duration <= 0 || duration >= NO_DURATION_VALUE) {
        return;
      }

      timerRef.current = setTimeout(() => {
        // The timeout is firing now, so the previous handle is no longer active.
        // Clearing it lets later loop-mode changes detect a true "held on final
        // artwork" state after repeat-off stops progression.
        timerRef.current = undefined;
        advanceFromSlot(normalizedIndex, snapshot);
      }, duration * 1000);
    },
    [advanceFromSlot, clearTimer, playlistDefaultsSettings]
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

  useEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      holdAfterFinalSlotRef.current = false;
      clearTimer();
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(currentIndex, playlist.length);
    const currentItem = playlist[normalizedIndex];

    void handleItemDisplayPreference(currentItem);
    setCastPreviewURL(currentItem.source);
    scheduleCurrentItemTimer(normalizedIndex, playlist);

    return () => {
      clearTimer();
    };
  }, [
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearTimer,
    handleItemDisplayPreference,
    scheduleCurrentItemTimer,
  ]);

  // eslint-disable-next-line max-lines-per-function
  useEffect(() => {
    if (!castInfo) {
      clearTimer();
      holdAfterFinalSlotRef.current = false;
      currentItemRef.current = undefined;
      loopModeRef.current = LoopMode.playlist;
      setPlaylist([]);
      setCurrentIndex(-1);
      setPlaylistDefaultsSettings(null);
      setCurrentItemDisplayPreference(null);
      setCastPreviewURL(null);
      return;
    }

    switch (castInfo.castCommand) {
      case CastCommand.displayPlaylist: {
        holdAfterFinalSlotRef.current = false;
        loopModeRef.current = coerceLoopMode(castInfo.loopMode);
        if (castInfo.playlist?.items?.length) {
          setPlaylistDefaultsSettings(castInfo.playlist.defaults ?? null);
          setPlaylist(
            castInfo.playlist.items.map(item => ({
              ...item,
              duration: item.duration ?? NO_DURATION_VALUE,
            }))
          );
          const startIndex = normalizePlaylistIndex(
            castInfo.index ?? 0,
            castInfo.playlist.items.length
          );
          setCurrentIndex(startIndex);
        } else {
          setPlaylist([]);
          setCurrentIndex(-1);
          setPlaylistDefaultsSettings(null);
          setCurrentItemDisplayPreference(null);
          setCastPreviewURL(null);
        }
        break;
      }

      case CastCommand.refreshPlaylist:
      case CastCommand.setShuffle: {
        if (castInfo.playlist?.items?.length) {
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
        currentItemRef.current = undefined;
        setPlaylist([]);
        setCurrentIndex(-1);
        setPlaylistDefaultsSettings(null);
        setCurrentItemDisplayPreference(null);
        setCastPreviewURL(null);
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
          setCurrentIndex(
            normalizePlaylistIndex(
              castInfo.index,
              castInfo.playlist.items.length
            )
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
    castInfo,
    clearTimer,
    replayCurrentSlot,
    scheduleCurrentItemTimer,
    triggerArtworkRefresh,
  ]);

  // Identity of the slot the player is currently rendering. Recomputed when
  // the playlist or current index changes; passed to ArtworkPlayer so the
  // end-of-stream gate can reject events from a previous adjacent item that
  // happens to share the same source URL.
  const currentItemIdentity = useMemo(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      return '';
    }
    return itemIdentityFor(
      playlist,
      normalizePlaylistIndex(currentIndex, playlist.length)
    );
  }, [currentIndex, playlist]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {currentItemDisplayPreference && (
          <ArtworkPlayer
            previewURL={castPreviewURL ?? ''}
            displayPreferences={currentItemDisplayPreference}
            itemIdentity={currentItemIdentity}
            onRegisterArtworkReload={registerArtworkReload}
            onSourceEnded={handleSourceEnded}
          />
        )}
      </div>
    </>
  );
}
