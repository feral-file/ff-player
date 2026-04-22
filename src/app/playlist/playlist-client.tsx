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
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldResumeSlotTimerAfterSetLoop,
} from '@/utils/playlist';
import { coerceLoopMode } from '@/utils/loopMode';
import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

function reportPlaylistDisplayPreferenceError(
  phase: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message = `[PlaylistClient] Error handling item display preference (${phase})`;
  console.error(
    message,
    error instanceof Error ? error.message : String(error)
  );
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { phase, ...extra },
    });
  } else {
    Sentry.captureMessage(message, {
      extra: {
        error: String(error),
        phase,
        ...extra,
      },
    });
  }
}

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

  // False negatives are possible when ArtworkPlayer has not yet run
  // useArtworkReloadRegistration (performReload still null) — CanvasService
  // surfaces that as ok:false for the cast sender to retry.
  //
  // Resolve the active source from CanvasService's in-memory cast snapshot, not
  // currentItemRef: cast commands run synchronously in CanvasService while refs
  // fed from React state only align after the next commit/layout, so a host
  // updateIndex/displayPlaylist followed immediately by refreshArtwork would
  // otherwise reload the previous slot or return ok:false.
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

  // Keep currentItemRef aligned with the latest committed slot before passive
  // effects run so refreshArtwork does not reload a stale source right after
  // updateIndex/displayPlaylist transitions.
  useLayoutEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      currentItemRef.current = undefined;
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(currentIndex, playlist.length);
    currentItemRef.current = playlist[normalizedIndex];
  }, [currentIndex, playlist]);

  // Attaches after commit; refreshArtwork cast can arrive between first paint and here.
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

  const publishCurrentIndex = useCallback((index: number) => {
    const currentCastInfo = canvasService.getCastInfo();
    if (!currentCastInfo) {
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

      const duration = currentItem.duration ?? 0;
      if (duration <= 0 || duration >= NO_DURATION_VALUE) {
        return;
      }

      timerRef.current = setTimeout(() => {
        holdAfterFinalSlotRef.current = false;
        // The timeout is firing now, so the previous handle is no longer active.
        // Clearing it lets later loop-mode changes detect a true "held on final
        // artwork" state after repeat-off stops progression.
        timerRef.current = undefined;

        if (loopModeRef.current === LoopMode.one) {
          // Apply queued playlist if any, staying on the same artwork.
          // keepCurrent=true: find the current item in the new list and loop it,
          // falling back to index 0 if the item was removed by a deferred refresh.
          // After apply, React effect reschedules the timer with the new playlist.
          if (applyQueuedPlaylistIfExists(undefined, true).applied) {
            return;
          }
          publishCurrentIndex(normalizedIndex);
          scheduleCurrentItemTimer(normalizedIndex, snapshot);
          return;
        }

        const queuedResult = applyQueuedPlaylistIfExists();
        if (queuedResult.applied) {
          return;
        }

        const nextIndex = resolveSequentialPlaylistAdvance({
          currentIndex: normalizedIndex,
          playlistLength: snapshot.length,
          loopMode: loopModeRef.current,
        });
        if (nextIndex === null) {
          // Repeat-off holds the final artwork on screen until another command
          // changes playback. Do not wrap or reschedule from this slot.
          if (
            loopModeRef.current === LoopMode.none &&
            normalizedIndex === snapshot.length - 1
          ) {
            holdAfterFinalSlotRef.current = true;
          }
          return;
        }

        // Single-item playlist: nextIndex wraps back to the same position.
        // setCurrentIndex would be a no-op and React would not re-run the
        // scheduling effect. Reschedule directly to keep the loop alive.
        if (nextIndex === normalizedIndex) {
          publishCurrentIndex(nextIndex);
          scheduleCurrentItemTimer(nextIndex, snapshot);
          return;
        }

        setCurrentIndex(nextIndex);
        publishCurrentIndex(nextIndex);
      }, duration * 1000);
    },
    [applyQueuedPlaylistIfExists, clearTimer, publishCurrentIndex]
  );

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
          // Leaving repeat-off while holding the last artwork should restart that
          // artwork's slot timer so playback can continue from the held frame.
          holdAfterFinalSlotRef.current = false;
          scheduleCurrentItemTimer(currentIndexRef.current, activePlaylist);
        }
        break;
      }
    }
  }, [
    applyQueuedPlaylistIfExists,
    castInfo,
    clearTimer,
    scheduleCurrentItemTimer,
    triggerArtworkRefresh,
  ]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {currentItemDisplayPreference && (
          <ArtworkPlayer
            previewURL={castPreviewURL ?? ''}
            displayPreferences={currentItemDisplayPreference}
            onRegisterArtworkReload={registerArtworkReload}
          />
        )}
      </div>
    </>
  );
}
