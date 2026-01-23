'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { getIndex, recalculateStartTimeForIndex } from '@/utils/playlist';
import { CastCommand } from '@/models';
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

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  useEffect(() => {
    console.log('[PlaylistClient] currentIndex useEffect triggered', {
      currentIndex,
      playlistLength: playlist.length,
      indexRefCurrent: indexRef.current,
      willSkip: currentIndex < 0 || playlist.length === 0 || indexRef.current === currentIndex,
    });

    if (currentIndex < 0) {
      console.log('[PlaylistClient] currentIndex < 0, skipping');
      return;
    }

    if (playlist.length === 0) {
      console.log('[PlaylistClient] playlist.length === 0, skipping');
      return;
    }

    if (indexRef.current === currentIndex) {
      console.log('[PlaylistClient] indexRef.current === currentIndex, skipping (already processed)');
      return;
    }

    console.log('[PlaylistClient] Processing new artwork index', {
      currentIndex,
      previousIndexRef: indexRef.current,
      playlistLength: playlist.length,
    });

    indexRef.current = currentIndex;

    const index = currentIndex % playlist.length;
    const currentItem = playlist[index];
    currentItemRef.current = currentItem;

    console.log('[PlaylistClient] Loading artwork', {
      calculatedIndex: index,
      itemId: currentItem.id,
      itemSource: currentItem.source,
      itemDuration: currentItem.duration,
      isPaused: castInfo?.isPaused,
    });

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
    console.log('[PlaylistClient] Set preview URL and starting interval', {
      previewURL: currentItem.source,
      duration: currentItem.duration ?? 0,
      isPaused: castInfo?.isPaused,
    });

    if (!castInfo?.isPaused) {
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
    const currentPlaylistItem = playlist[currentIndex];
    const currentArtwork = dp1Items.find(a => a.id === currentPlaylistItem.id);
    if (currentArtwork) {
      startInterval(currentArtwork.duration ?? 0);
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
    console.log('handleResumeCasting');
    const startTime = castInfo?.startTime ?? Date.now();
    setStartTime(startTime);
    let duration = remainTimeRef.current;
    if (
      duration === 0 &&
      castInfo?.playlist?.items?.length &&
      currentIndex >= 0
    ) {
      duration = castInfo.playlist.items[currentIndex].duration ?? 0;
    }

    startInterval(duration);
  };

  const handleNext = () => {
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();
    console.log('[PlaylistClient] handleNext called', {
      index,
      currentPlaylistLength: playlist.length,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(index);
    const targetIndex = result.applied && result.nextIndex !== undefined ? result.nextIndex : index;

    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handlePrevious = () => {
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();
    console.log('[PlaylistClient] handlePrevious called', {
      index,
      currentPlaylistLength: playlist.length,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(index);
    const targetIndex = result.applied && result.nextIndex !== undefined ? result.nextIndex : index;

    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handleMoveToArtwork = () => {
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();
    console.log('[PlaylistClient] handleMoveToArtwork called', {
      index,
      currentPlaylistLength: playlist.length,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Apply queued playlist immediately if it exists, using the target index
    const result = applyQueuedPlaylistIfExists(index);
    
    // Use the calculated index from the applied playlist if available, otherwise use the original index
    const targetIndex = result.applied && result.nextIndex !== undefined ? result.nextIndex : index;
    
    if (result.applied) {
      console.log('[PlaylistClient] Playlist applied, using calculated index', {
        calculatedIndex: result.nextIndex,
        originalIndex: index,
        finalTargetIndex: targetIndex,
      });
    }

    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(targetIndex);
  };

  const handleUpdateIndex = () => {
    const newIndex = castInfo?.index ?? 0;
    console.log('[PlaylistClient] handleUpdateIndex called', {
      newIndex,
      previousIndex: currentIndex,
      playlistLength: playlist.length,
      castInfoIndex: castInfo?.index,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Apply queued playlist immediately if it exists
    const result = applyQueuedPlaylistIfExists(newIndex);
    const targetIndex = result.applied && result.nextIndex !== undefined ? result.nextIndex : newIndex;

    setCurrentIndex(targetIndex);
  };

  const applyQueuedPlaylistIfExists = (targetIndex?: number): { applied: boolean; nextIndex?: number; newPlaylist?: DP1Item[] } => {
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
      // Ensure targetIndex is valid for the new playlist
      nextIndex = targetIndex % newPlaylist.length;
    }

    const newStartTime = recalculateStartTimeForIndex(newPlaylist, nextIndex);
    console.log('[PlaylistClient] Applied queued playlist', {
      nextIndex,
      newPlaylistLength: newPlaylist.length,
      newStartTime,
      targetIndexProvided: targetIndex !== undefined,
    });

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
    console.log('[PlaylistClient] handleRefreshPlaylist called', {
      currentIndex,
      currentItemId: currentItemRef.current?.id,
      currentPlaylistLength: playlist.length,
      queuedPlaylistExists: queuedPlaylistRef.current !== null,
    });

    // Queue the refreshed playlist to swap at the end of the current item's duration
    const newItems = castInfo?.playlist?.items ?? [];
    console.log('[PlaylistClient] New playlist items received', {
      newItemsCount: newItems.length,
      newItems: newItems.map(item => ({
        id: item.id,
        title: item.title,
      })),
    });

    if (!newItems.length) {
      console.log('[PlaylistClient] handleRefreshPlaylist: No new items, returning early');
      return;
    }

    queuedPlaylistRef.current = newItems.map(item => ({
      ...item,
      duration: item.duration ?? 0,
    }));

    console.log('[PlaylistClient] Playlist queued successfully', {
      queuedItemsCount: queuedPlaylistRef.current.length,
      currentItemId: currentItemRef.current?.id,
      currentItemDuration: currentItemRef.current?.duration,
    });
  };

  const startInterval = (duration: number) => {
    console.log('[PlaylistClient] startInterval called', {
      duration,
      currentItemId: currentItemRef.current?.id,
      hasExistingInterval: intervalRef.current !== undefined,
    });

    if (intervalRef.current) {
      console.log('[PlaylistClient] Clearing existing interval');
      clearInterval(intervalRef.current);
    }

    if (duration === 0 || duration === NO_DURATION_VALUE) {
      console.log('[PlaylistClient] Duration is 0 or NO_DURATION_VALUE, not starting interval');
      return;
    }

    console.log('[PlaylistClient] Setting up new interval', {
      duration,
      intervalMs: duration * 1000,
    });

    intervalRef.current = setInterval(() => {
      const currentCastInfo = canvasService.getCastInfo();
      // If a refreshed playlist has been queued, swap it in exactly at the boundary
      if (queuedPlaylistRef.current?.length) {
        console.log('[PlaylistClient] Interval fired: Swapping queued playlist', {
          queuedItemsCount: queuedPlaylistRef.current.length,
          currentIndex,
          currentItemId: currentItemRef.current?.id,
          currentPlaylistLength: playlist.length,
        });

        // Use the helper function to apply the queued playlist
        const result = applyQueuedPlaylistIfExists();
        if (result.applied && result.nextIndex !== undefined) {
          console.log('[PlaylistClient] Updated state and triggering updateIndex command', {
            nextIndex: result.nextIndex,
            newPlaylistLength: result.newPlaylist?.length,
          });
          canvasService.setCastInfo({
            ...currentCastInfo,
            castCommand: CastCommand.updateIndex,
            index: result.nextIndex,
          });
        }

        return;
      }

      const index = getIndex(playlist, startTime);
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
      JSON.stringify(castInfo?.castCommand),
      {
        castCommand: castInfo?.castCommand,
        index: castInfo?.index,
        startTime: castInfo?.startTime,
        playlistItemsCount: castInfo?.playlist?.items?.length,
      }
    );
    if (castInfo) {
      const handleCastCommand = () => {
        switch (castInfo.castCommand) {
          case CastCommand.refreshPlaylist: {
            console.log('[PlaylistClient] Processing refreshPlaylist command');
            handleRefreshPlaylist();
            break;
          }
          case CastCommand.displayPlaylist: {
            // Reset data for new playlist arrival
            indexRef.current = -1;
            setCurrentIndex(-1);
            setPlaylistDefaultsSettings(null);
            currentItemRef.current = undefined;

            if (castInfo.playlist?.items?.length) {
              if (castInfo.playlist.defaults?.display) {
                setPlaylistDefaultsSettings(castInfo.playlist.defaults);
              }

              setPlaylist(castInfo.playlist.items);
              if (castInfo.startTime) {
                setStartTime(castInfo.startTime);
                const i = getIndex(castInfo.playlist.items, castInfo.startTime);
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
            console.log('[PlaylistClient] Processing updateIndex command', {
              castInfoIndex: castInfo.index,
              currentIndex,
            });
            handleUpdateIndex();
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
