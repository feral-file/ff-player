'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { getIndex, recalculateStartTimeForIndex } from '@/utils/playlist';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
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
import { useKeyboardTransportControls } from './useKeyboardTransportControls';

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

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  const isDebugOverlayEnabled = (
    displayPreference?: DP1DisplayPreference | null
  ): boolean => {
    if (!displayPreference) {
      return false;
    }

    if (displayPreference.debugOverlay) {
      return true;
    }

    const keyboardShortcuts = displayPreference.interaction?.keyboard || [];
    return keyboardShortcuts.includes('debugOverlay');
  };

  const getArtistLabel = (
    item?: DP1Item,
    displayPreference?: DP1DisplayPreference | null
  ): string => {
    if (!item) {
      return 'Unknown';
    }

    const displayArtist = displayPreference?.debugArtist;
    if (typeof displayArtist === 'string' && displayArtist.trim()) {
      return displayArtist;
    }

    const record = item as unknown as Record<string, unknown>;
    const raster = record.raster as Record<string, unknown> | undefined;
    const rasterArtist =
      typeof raster?.artistName === 'string' ? raster.artistName : undefined;

    return rasterArtist || 'Unknown';
  };

  const getOwnerLabel = (
    item?: DP1Item,
    displayPreference?: DP1DisplayPreference | null
  ): string => {
    if (!item) {
      return 'Unknown';
    }

    const displayOwner = displayPreference?.debugOwner;
    if (typeof displayOwner === 'string' && displayOwner.trim()) {
      return displayOwner;
    }

    const record = item as unknown as Record<string, unknown>;
    const owner = record.owner;
    const ownerName = record.ownerName;
    const ownerLabel = record.ownerLabel;

    if (typeof ownerLabel === 'string' && ownerLabel.trim()) {
      return ownerLabel;
    }

    if (typeof ownerName === 'string' && ownerName.trim()) {
      return ownerName;
    }

    if (typeof owner === 'string' && owner.trim()) {
      return owner;
    }

    if (owner && typeof owner === 'object') {
      const ownerRecord = owner as Record<string, unknown>;
      if (typeof ownerRecord.name === 'string' && ownerRecord.name.trim()) {
        return ownerRecord.name;
      }
    }

    return 'Unknown';
  };

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

    // Safely access current item
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      const currentPlaylistItem = playlist[currentIndex];
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

  const handleSetLoop = () => {
    const validLoopModes = new Set<string>(Object.values(LoopMode));
    const raw = castInfo?.loopMode as string | undefined;
    loopModeRef.current =
      raw && validLoopModes.has(raw) ? (raw as LoopMode) : LoopMode.playlist;
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
      // If a refreshed playlist has been queued, swap it in exactly at the boundary
      if (queuedPlaylistRef.current?.length) {
        // Use the helper function to apply the queued playlist
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

      const index = getIndex(playlist, startTimeRef.current);
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
            handleUpdateIndex();
            break;
          }
          case CastCommand.setShuffle: {
            handleSetShuffle();
            break;
          }
          case CastCommand.setLoop: {
            handleSetLoop();
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

  useKeyboardTransportControls({
    castInfo: castInfo ?? undefined,
    playlist,
    currentIndex,
    startTime,
    displayPreference: currentItemDisplayPreference,
    elapsedTimeRef,
    remainTimeRef,
  });

  return (
    <>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {isDebugOverlayEnabled(currentItemDisplayPreference) &&
          currentItemRef.current && (
            <div
              style={{
                position: 'absolute',
                right: '24px',
                bottom: '24px',
                zIndex: 10,
                maxWidth: '40vw',
                backgroundColor: 'rgba(0, 0, 0, 0.72)',
                color: '#f5f5f5',
                padding: '12px 14px',
                borderRadius: '8px',
                fontFamily: 'PP Mori, system-ui, sans-serif',
                fontSize: '14px',
                lineHeight: '1.35',
                letterSpacing: '0.01em',
              }}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                Now Displaying
              </div>
              <div>Title: {currentItemRef.current.title || 'Untitled'}</div>
              <div>
                Artist:{' '}
                {getArtistLabel(
                  currentItemRef.current,
                  currentItemDisplayPreference
                )}
              </div>
              <div>
                Owner:{' '}
                {getOwnerLabel(
                  currentItemRef.current,
                  currentItemDisplayPreference
                )}
              </div>
            </div>
          )}
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
