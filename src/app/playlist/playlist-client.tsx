'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import {
  consumePendingIntervalOverride,
  getIndex,
  getPlaybackPosition,
  getRemainingDurationMs,
  PendingIntervalOverride,
  planSetLoopTimerHandoff,
  recalculateStartTimeForIndex,
  resolveRepeatOneRestartMs,
} from '@/utils/playlist';
import { CastCommand } from '@/models';
import { coerceLoopMode, LoopMode } from '@/models/cast_info.model';
import { useEffect, useRef, useState } from 'react';
import {
  defaultDP1DisplayPreference,
  DP1DisplayPreference,
  DP1Item,
  DP1Defaults,
} from '@/models/dp1.model';
import { NO_DURATION_VALUE } from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { DP1Service } from '@/services/DP1Service';
import * as Sentry from '@sentry/nextjs';

export default function PlaylistClient() {
  const { context } = useAppContext();
  const castInfo = context.castInfo;

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentItemDisplayPreference, setCurrentItemDisplayPreference] =
    useState<DP1DisplayPreference | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const indexRef = useRef<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>();
  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);
  const currentItemRef = useRef<DP1Item>();
  // A queued playlist to be swapped in when the current item's timer ends
  const queuedPlaylistRef = useRef<DP1Item[] | null>(null);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);
  // Mutable mirror of startTime state so the setInterval closure always reads the
  // latest value without needing to be recreated on every startTime change.
  const startTimeRef = useRef<number>(0);
  // When an external command re-anchors playback mid-slot, the next interval must
  // start from the remaining slot time rather than the artwork's full duration.
  const nextIntervalDurationRef = useRef<PendingIntervalOverride | null>(null);

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  // Keep in sync with cast payload before other castInfo effects run (command handlers
  // may depend on loopModeRef during the same commit).
  useEffect(() => {
    loopModeRef.current = coerceLoopMode(
      castInfo?.loopMode as string | undefined
    );
  }, [castInfo?.loopMode]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  useEffect(() => {
    if (currentIndex < 0) {
      return;
    }

    if (playlist.length === 0) {
      return;
    }

    if (indexRef.current === currentIndex) {
      return;
    }

    indexRef.current = currentIndex;

    const index = currentIndex % playlist.length;
    const currentItem = playlist[index];
    currentItemRef.current = currentItem;

    handleItemDisplayPreference(currentItem, playlistDefaultsSettings).catch(
      (error: unknown) => {
        console.error(
          '[PlaylistClient] Error handling item display preference',
          error instanceof Error ? error.message : String(error)
        );
        Sentry.captureMessage(
          '[PlaylistClient] Error handling item display preference',
          {
            extra: {
              error: error instanceof Error ? error.message : String(error),
            },
          }
        );
      }
    );

    // Setup data for ArtworkPlayer component
    setCastPreviewURL(currentItem.source);

    if (!castInfo?.isPaused) {
      const { durationSeconds, remainingOverride } =
        consumePendingIntervalOverride(
          nextIntervalDurationRef.current,
          currentIndex
        );
      nextIntervalDurationRef.current = remainingOverride;
      startInterval(durationSeconds ?? (currentItem.duration ?? 0));
    }
  }, [currentIndex, playlist]);

  const handleItemDisplayPreference = async (
    dp1Item: DP1Item,
    playlistDefaultsSettings: DP1Defaults | null
  ) => {
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
      } catch {
        // Ignore ref load errors
      }

      // 2) Item override
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

      if (
        currentItemRef.current?.id === activeItemId &&
        currentItemRef.current.ref === activeRef
      ) {
        setCurrentItemDisplayPreference(merged);
      }
    } catch {
      if (
        currentItemRef.current?.id === activeItemId &&
        currentItemRef.current.ref === activeRef
      ) {
        setCurrentItemDisplayPreference(defaultDP1DisplayPreference);
      }
    }
  };

  const handleUpdateDuration = (dp1Items: DP1Item[]) => {
    const durationMap = new Map<string, number>();
    dp1Items.forEach((a: DP1Item) => {
      durationMap.set(a.id, a.duration ?? 0);
    });

    const updatedPlaylist = playlist.map((item: DP1Item) => {
      return {
        ...item,
        duration: durationMap.get(item.id) ?? 0,
      };
    });

    const startTime = castInfo?.startTime ?? Date.now();

    // Safely access current item (normalize in case currentIndex was grown by LoopMode.one)
    const normalizedIndex =
      currentIndex >= 0 ? currentIndex % playlist.length : -1;
    if (normalizedIndex >= 0) {
      const currentPlaylistItem = playlist[normalizedIndex];
      const currentArtwork = dp1Items.find(
        a => a.id === currentPlaylistItem.id
      );
      if (currentArtwork) {
        startInterval(currentArtwork.duration ?? 0);
      }
    }

    setStartTime(startTime);
    setPlaylist(updatedPlaylist);
  };

  const handlePauseCasting = () => {
    console.log('handlePauseCasting');
    nextIntervalDurationRef.current = null;
    clearTimer();
    elapsedTimeRef.current = castInfo?.elapsedTime ?? 0;
    remainTimeRef.current = castInfo?.remainTime ?? 0;
  };

  const handleResumeCasting = () => {
    console.log('[PlaylistClient] handleResumeCasting called', {
      currentIndex,
      playlistLength: playlist.length,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Apply queued playlist first if it exists
    const result = applyQueuedPlaylistIfExists();
    if (result.applied) {
      // Navigate to the calculated next item; the useEffect will call startInterval
      // with the correct duration. Returning early avoids a redundant startInterval
      // call with a potentially stale duration.
      if (result.nextIndex !== undefined) {
        setCurrentIndex(result.nextIndex);
      }
      return;
    }

    const startTime = castInfo?.startTime ?? Date.now();
    setStartTime(startTime);

    let duration = remainTimeRef.current;
    if (duration === 0 && playlist.length && currentIndex >= 0) {
      const normalizedIndex = currentIndex % playlist.length;
      duration = playlist[normalizedIndex].duration ?? 0;
    }

    startInterval(duration);
  };

  const handleNext = () => {
    nextIntervalDurationRef.current = null;
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(index);
    const targetIndex =
      result.applied && result.nextIndex !== undefined
        ? result.nextIndex
        : index;

    if (!result.applied) {
      setStartTime(startTime);
    }

    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handlePrevious = () => {
    nextIntervalDurationRef.current = null;
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(index);
    const targetIndex =
      result.applied && result.nextIndex !== undefined
        ? result.nextIndex
        : index;

    if (!result.applied) {
      setStartTime(startTime);
    }

    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handleMoveToArtwork = () => {
    nextIntervalDurationRef.current = null;
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();

    // Apply queued playlist immediately if it exists, using the target index
    const result = applyQueuedPlaylistIfExists(index);

    // Use the calculated index from the applied playlist if available, otherwise use the original index
    const targetIndex =
      result.applied && result.nextIndex !== undefined
        ? result.nextIndex
        : index;

    if (result.applied) {
      console.log('[PlaylistClient] Playlist applied, using calculated index', {
        calculatedIndex: result.nextIndex,
        originalIndex: index,
        finalTargetIndex: targetIndex,
      });
    }

    if (!result.applied) {
      setStartTime(startTime);
    }

    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handleUpdateIndex = () => {
    nextIntervalDurationRef.current = null;
    const newIndex = castInfo?.index ?? 0;

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(newIndex);
    const targetIndex =
      result.applied && result.nextIndex !== undefined
        ? result.nextIndex
        : newIndex;

    setCurrentIndex(targetIndex);
  };

  const applyQueuedPlaylistIfExists = (
    targetIndex?: number
  ): { applied: boolean; nextIndex?: number; newPlaylist?: DP1Item[] } => {
    if (!queuedPlaylistRef.current?.length) {
      return { applied: false };
    }

    console.log('[PlaylistClient] Applying queued playlist immediately', {
      queuedItemsCount: queuedPlaylistRef.current.length,
      currentPlaylistLength: playlist.length,
      targetIndex,
      currentIndex,
    });

    const newPlaylist = queuedPlaylistRef.current;
    queuedPlaylistRef.current = null;

    // If targetIndex is provided, use it; otherwise calculate based on current item
    let nextIndex = targetIndex ?? 0;
    if (targetIndex === undefined) {
      const currentId = currentItemRef.current?.id;
      if (currentId) {
        const foundIdx = newPlaylist.findIndex(i => i.id === currentId);
        if (foundIdx >= 0) {
          nextIndex = (foundIdx + 1) % newPlaylist.length;
        } else {
          nextIndex = currentIndex >= 0 ? currentIndex % newPlaylist.length : 0;
        }
      }
    } else {
      nextIndex = Math.max(0, targetIndex) % newPlaylist.length;
    }

    const newStartTime = recalculateStartTimeForIndex(newPlaylist, nextIndex);

    // Reset indexRef to force useEffect to run
    indexRef.current = -1;

    // Only reset currentIndex if no targetIndex was provided (for automatic progression)
    // If targetIndex was provided, let the caller set it
    if (targetIndex === undefined) {
      setCurrentIndex(-1);
    }

    setPlaylist(newPlaylist);
    setStartTime(newStartTime);

    return { applied: true, nextIndex, newPlaylist };
  };

  const handleRefreshPlaylist = () => {
    // Queue the refreshed playlist to swap at the end of the current item's duration
    const newItems = castInfo?.playlist?.items ?? [];

    if (!newItems.length) {
      return;
    }

    queuedPlaylistRef.current = newItems.map(item => ({
      ...item,
      duration: item.duration ?? 0,
    }));
  };

  const handleSetShuffle = () => {
    const newItems = castInfo?.playlist?.items;
    if (!newItems?.length) return;

    // Queue the new order; the current item keeps playing uninterrupted.
    // applyQueuedPlaylistIfExists() fires at the next item boundary and picks
    // up the correct next index automatically.
    queuedPlaylistRef.current = newItems.map(item => ({
      ...item,
      duration: item.duration ?? 0,
    }));
  };

  const startInterval = (duration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (duration === 0 || duration === NO_DURATION_VALUE) {
      return;
    }

    intervalRef.current = setInterval(() => {
      const currentCastInfo = canvasService.getCastInfo();
      const currentLoopMode = loopModeRef.current;

      // Loop-one: replay the same item.
      if (currentLoopMode === LoopMode.one) {
        // Always resolve the current item's index against the castInfo playlist
        // (which may already be shuffled/reordered by CanvasService) using the
        // item ID as the source of truth. indexRef.current reflects the OLD
        // playlist order and must not be used directly here.
        const castInfoItems = currentCastInfo?.playlist?.items ?? playlist;
        let realIndex = -1;
        if (currentItemRef.current) {
          realIndex = castInfoItems.findIndex(
            i => i.id === currentItemRef.current?.id
          );
        }
        if (realIndex < 0 && indexRef.current >= 0) {
          realIndex = Math.min(indexRef.current, castInfoItems.length - 1);
        }
        if (realIndex < 0) realIndex = 0; // ultimate safe fallback

        // Reset the timeline anchor so that if loop mode changes later,
        // getIndex(playlist, startTimeRef.current) still returns realIndex
        // rather than a position N loops ahead in wall-clock time.
        const newStartTime = recalculateStartTimeForIndex(
          castInfoItems,
          realIndex
        );
        startTimeRef.current = newStartTime;
        setStartTime(newStartTime);

        indexRef.current = -1;
        canvasService.setCastInfo({
          ...currentCastInfo,
          startTime: newStartTime,
          castCommand: CastCommand.updateIndex,
          index: realIndex,
        });
        return;
      }

      // If a refreshed/shuffled playlist has been queued, swap it in at the boundary
      if (queuedPlaylistRef.current?.length) {
        const result = applyQueuedPlaylistIfExists();
        if (result.applied && result.nextIndex !== undefined) {
          canvasService.setCastInfo({
            ...currentCastInfo,
            castCommand: CastCommand.updateIndex,
            index: result.nextIndex,
          });
        }
        return;
      }

      // Repeat-off: once wall-clock has passed the full playlist, stay parked on the
      // last item without re-emitting updateIndex on every timer tick.
      if (currentLoopMode === LoopMode.none) {
        const remainingMs = getRemainingDurationMs(
          playlist,
          startTimeRef.current,
          LoopMode.none
        );
        if (remainingMs === 0) {
          clearTimer();
          return;
        }
      }

      const index = getIndex(
        playlist,
        startTimeRef.current,
        loopModeRef.current
      );
      canvasService.setCastInfo({
        ...currentCastInfo,
        castCommand: CastCommand.updateIndex,
        index,
      });
    }, duration * 1000);
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  useEffect(() => {
    console.log(
      '[PlaylistClient] process cast info',
      JSON.stringify(castInfo?.castCommand)
    );
    if (castInfo) {
      const handleCastCommand = () => {
        switch (castInfo.castCommand) {
          case CastCommand.refreshPlaylist: {
            handleRefreshPlaylist();
            break;
          }
          case CastCommand.displayPlaylist: {
            // Reset data for new playlist arrival
            nextIntervalDurationRef.current = null;
            indexRef.current = -1;
            setCurrentIndex(-1);
            setPlaylistDefaultsSettings(null);
            currentItemRef.current = undefined;
            queuedPlaylistRef.current = null;

            if (castInfo.playlist?.items?.length) {
              if (castInfo.playlist.defaults?.display) {
                setPlaylistDefaultsSettings(castInfo.playlist.defaults);
              }

              setPlaylist(castInfo.playlist.items);
              if (castInfo.startTime) {
                setStartTime(castInfo.startTime);
                const i = getIndex(
                  castInfo.playlist.items,
                  castInfo.startTime,
                  coerceLoopMode(castInfo.loopMode as string | undefined)
                );
                setCurrentIndex(i);
              }

              if (castInfo.isPaused) {
                handlePauseCasting();
              }
            }

            break;
          }
          case CastCommand.nextArtwork: {
            handleNext();
            break;
          }
          case CastCommand.previousArtwork: {
            handlePrevious();
            break;
          }
          case CastCommand.moveToArtwork: {
            handleMoveToArtwork();
            break;
          }
          case CastCommand.updateDuration: {
            if (castInfo.playlist?.items) {
              handleUpdateDuration(castInfo.playlist.items);
            }
            break;
          }
          case CastCommand.pauseCasting: {
            handlePauseCasting();
            break;
          }
          case CastCommand.resumeCasting: {
            handleResumeCasting();
            break;
          }
          case CastCommand.updateIndex: {
            handleUpdateIndex();
            break;
          }
          case CastCommand.setShuffle: {
            handleSetShuffle();
            break;
          }
          case CastCommand.setLoop: {
            // CanvasService may re-anchor startTime when leaving repeat-off after the
            // first full cycle. Recompute the active slot immediately and restart the
            // interval from the slot remainder so exact-boundary none->playlist wraps
            // do not wait for the stale pre-anchor timer cadence.
            if (
              castInfo.startTime != null &&
              castInfo.playlist?.items?.length
            ) {
              startTimeRef.current = castInfo.startTime;
              setStartTime(castInfo.startTime);

              const nextLoopMode = coerceLoopMode(
                castInfo.loopMode as string | undefined
              );
              const { index: nextIndex, remainingDurationMs: rawRemainingMs } =
                getPlaybackPosition(
                  castInfo.playlist.items,
                  castInfo.startTime,
                  nextLoopMode
                );

              const nextIntervalDurationMs = resolveRepeatOneRestartMs(
                castInfo.playlist.items,
                nextIndex,
                rawRemainingMs,
                nextLoopMode
              );

              const timerPlan = planSetLoopTimerHandoff(
                currentIndex,
                nextIndex,
                nextIntervalDurationMs,
                castInfo.isPaused ?? false,
                Boolean(queuedPlaylistRef.current?.length)
              );

              if (timerPlan.shouldClearTimer) {
                // Stop the pre-anchor cadence before handing off to either the
                // immediate restart path or the next-index effect path.
                clearTimer();
              }

              if (timerPlan.resumeDurationSeconds != null) {
                remainTimeRef.current = timerPlan.resumeDurationSeconds;
              }
              nextIntervalDurationRef.current = timerPlan.pendingOverride;

              if (timerPlan.restartDurationSeconds !== null) {
                startInterval(timerPlan.restartDurationSeconds);
              }

              if (
                timerPlan.pendingOverride !== null &&
                nextIndex !== currentIndex
              ) {
                setCurrentIndex(nextIndex);
              }
            }
            break;
          }
        }
      };
      handleCastCommand();
    }
  }, [castInfo]);

  useEffect(() => {
    if (context.isOnline) {
      handleResumeCasting();
    } else {
      handlePauseCasting();
    }
  }, [context.isOnline]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {currentItemDisplayPreference && (
          <ArtworkPlayer
            previewURL={castPreviewURL ?? ''}
            displayPreferences={currentItemDisplayPreference}
          />
        )}
      </div>
    </>
  );
}
