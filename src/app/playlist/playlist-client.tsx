'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import {
  getIndex,
  isRepeatOffPastEnd,
  recalculateStartTimeForIndex,
  remainingMsInActiveSlot,
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;
  const tickFnRef = useRef<() => void>(() => undefined);
  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);
  const currentItemRef = useRef<DP1Item>();
  // A queued playlist to be swapped in when the current item's timer ends
  const queuedPlaylistRef = useRef<DP1Item[] | null>(null);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);
  /** Loop mode last applied from a castInfo update (for setLoop transition detection). */
  const lastAppliedLoopModeRef = useRef<LoopMode>(LoopMode.playlist);
  // Mutable mirror of startTime state so the setInterval closure always reads the
  // latest value without needing to be recreated on every startTime change.
  const startTimeRef = useRef<number>(0);

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
      if (
        loopModeRef.current === LoopMode.none &&
        isRepeatOffPastEnd(playlist, startTimeRef.current)
      ) {
        return;
      }
      startInterval(currentItem.duration ?? 0);
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
    canvasService.setPlaybackTimelineItems(newPlaylist);

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

  const runPlaylistIntervalTick = () => {
    const playlistLocal = playlistRef.current;
    const currentCastInfo = canvasService.getCastInfo();
    const currentLoopMode = loopModeRef.current;

    // Loop-one: replay the same item.
    if (currentLoopMode === LoopMode.one) {
      const castInfoItems =
        currentCastInfo?.playlist?.items ?? playlistLocal;
      let realIndex = -1;
      if (currentItemRef.current) {
        realIndex = castInfoItems.findIndex(
          i => i.id === currentItemRef.current?.id
        );
      }
      if (realIndex < 0 && indexRef.current >= 0) {
        realIndex = Math.min(indexRef.current, castInfoItems.length - 1);
      }
      if (realIndex < 0) realIndex = 0;

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

    if (
      currentLoopMode === LoopMode.none &&
      isRepeatOffPastEnd(playlistLocal, startTimeRef.current)
    ) {
      clearTimer();
      return;
    }

    const index = getIndex(
      playlistLocal,
      startTimeRef.current,
      loopModeRef.current
    );
    canvasService.setCastInfo({
      ...currentCastInfo,
      castCommand: CastCommand.updateIndex,
      index,
    });
  };

  tickFnRef.current = runPlaylistIntervalTick;

  const clearTimer = () => {
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      clearTimeout(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  const startInterval = (duration: number) => {
    clearTimer();

    if (duration === 0 || duration === NO_DURATION_VALUE) {
      return;
    }

    intervalRef.current = setInterval(() => {
      tickFnRef.current();
    }, duration * 1000);
  };

  /**
   * After CanvasService re-anchors `startTime` on a none↔playlist setLoop, rebuild the
   * slot timer from the true phase. Otherwise the previous interval still waits a full
   * prior slot duration (bad when the new remainder is ~0 at a none→playlist boundary).
   * Only for those transitions: other modes do not re-anchor `startTime`, and
   * `remainingMsInActiveSlot` for `one`/`none` with multi-cycle wall time does not match
   * playlist modulo phase.
   */
  const rescheduleSlotTimerAfterLoopChange = (
    items: DP1Item[],
    startTimeMs: number,
    loopMode: LoopMode
  ) => {
    clearTimer();
    const remainMs = remainingMsInActiveSlot(items, startTimeMs, loopMode);
    const nearBoundaryMs = 16;
    if (remainMs <= nearBoundaryMs) {
      const delayMs = Math.max(0, remainMs);
      intervalRef.current = window.setTimeout(() => {
        intervalRef.current = undefined;
        tickFnRef.current();
      }, delayMs) as unknown as ReturnType<typeof setInterval>;
    } else {
      startInterval(remainMs / 1000);
    }
  };

  useEffect(() => {
    console.log(
      '[PlaylistClient] process cast info',
      JSON.stringify(castInfo?.castCommand)
    );
    if (castInfo) {
      const loopModeBeforeThisCastInfo = lastAppliedLoopModeRef.current;

      const handleCastCommand = () => {
        switch (castInfo.castCommand) {
          case CastCommand.refreshPlaylist: {
            handleRefreshPlaylist();
            break;
          }
          case CastCommand.displayPlaylist: {
            // Reset data for new playlist arrival
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
            // CanvasService re-anchors startTime only for none↔playlist; align refs and
            // reschedule the timer only for those transitions so we do not clobber the
            // interval with wrong remainder math (e.g. playlist→one with long elapsed).
            if (castInfo.startTime != null) {
              startTimeRef.current = castInfo.startTime;
              setStartTime(castInfo.startTime);
            }
            const nextLoopMode = coerceLoopMode(
              castInfo.loopMode as string | undefined
            );
            const isNonePlaylistTransition =
              (loopModeBeforeThisCastInfo === LoopMode.none &&
                nextLoopMode === LoopMode.playlist) ||
              (loopModeBeforeThisCastInfo === LoopMode.playlist &&
                nextLoopMode === LoopMode.none);
            if (
              isNonePlaylistTransition &&
              !castInfo.isPaused &&
              castInfo.playlist?.items?.length &&
              castInfo.startTime != null
            ) {
              rescheduleSlotTimerAfterLoopChange(
                castInfo.playlist.items,
                castInfo.startTime,
                nextLoopMode
              );
            }
            break;
          }
        }
      };
      handleCastCommand();

      lastAppliedLoopModeRef.current = coerceLoopMode(
        castInfo.loopMode as string | undefined
      );
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
