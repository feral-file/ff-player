'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { CastingArtworkType } from '@/models/metric.model';
import { getIndex, recalculateStartTimeForIndex } from '@/utils/playlist';
import { CastCommand } from '@/models';
import { useEffect, useRef, useState } from 'react';
import { defaultDP1DisplayPreference, DP1Item } from '@/models/dp1.model';
import { LEE_MULLICAN_EXHIBITION_CONTRACT } from '@/constants';
import { convertToTokenID } from '@/utils/indexer';
import { DP1Service } from '@/services/DP1Service';
import { canvasService } from '@/services/CanvasService';

export default function PlaylistClient() {
  const { context } = useAppContext();
  const castInfo = context.castInfo;

  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [isLeeMullicanExhibition, setIsLeeMullicanExhibition] =
    useState<boolean>(false);

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
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
    if (currentItem !== currentItemRef.current) {
      currentItemRef.current = currentItem;
      if (currentItem.provenance?.contract) {
        const tokenID = convertToTokenID(
          currentItem.provenance.contract.chain,
          currentItem.provenance.contract.address,
          currentItem.provenance.contract.tokenId
        );
        setArtworkID(tokenID);
      } else {
        setArtworkID(currentItem.id);
      }
    }

    fetchItemPreviewURL(currentItem).catch((error: unknown) => {
      console.log('[PlaylistClient] Error fetching item preview URL:', error);
    });

    setIsLeeMullicanExhibition(
      currentItem.provenance?.contract?.address ===
        LEE_MULLICAN_EXHIBITION_CONTRACT
    );

    if (!castInfo?.isPaused) {
      startInterval(currentItem.duration ?? 0);
    }
  }, [currentIndex, playlist]);

  const fetchItemPreviewURL = async (item: DP1Item) => {
    const itemInfo = await DP1Service.getItemInfo(item);
    setCastPreviewURL(itemInfo?.preview ?? null);
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
    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(index);
  };

  const handlePrevious = () => {
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();
    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(index);
  };

  const handleMoveToArtwork = () => {
    const index = castInfo?.index ?? 0;
    const startTime = castInfo?.startTime ?? Date.now();
    setStartTime(startTime);
    clearTimer();
    setCurrentIndex(index);
  };

  const handleUpdateIndex = () => {
    setCurrentIndex(castInfo?.index ?? 0);
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

  const startInterval = (duration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (duration === 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      const currentCastInfo = canvasService.getCastInfo();
      // If a refreshed playlist has been queued, swap it in exactly at the boundary
      if (queuedPlaylistRef.current?.length) {
        const newPlaylist = queuedPlaylistRef.current;
        queuedPlaylistRef.current = null;

        // Determine next index in the new playlist
        const currentId = currentItemRef.current?.id;
        let nextIndex = 0;
        if (currentId) {
          const foundIdx = newPlaylist.findIndex(i => i.id === currentId);
          if (foundIdx >= 0) {
            nextIndex = (foundIdx + 1) % newPlaylist.length;
          } else {
            nextIndex =
              currentIndex >= 0 ? currentIndex % newPlaylist.length : 0;
          }
        }

        const newStartTime = recalculateStartTimeForIndex(
          newPlaylist,
          nextIndex
        );
        console.log('Use queued playlist');
        console.log('Current index: ', currentIndex);
        console.log('Next index: ', nextIndex);

        indexRef.current = -1;
        setCurrentIndex(-1);
        setPlaylist(newPlaylist);
        setStartTime(newStartTime);
        canvasService.setCastInfo({
          ...currentCastInfo,
          castCommand: CastCommand.updateIndex,
          index: nextIndex,
        });

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
    console.log('[PlaylistClient] castInfo', castInfo);
    if (castInfo) {
      const handleCastCommand = () => {
        switch (castInfo.castCommand) {
          case CastCommand.refreshPlaylist: {
            handleRefreshPlaylist();
            break;
          }
          case CastCommand.displayPlaylist: {
            indexRef.current = -1;
            setCurrentIndex(-1);

            if (castInfo.playlist?.items?.length) {
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
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID ?? ''}
          castingType={CastingArtworkType.Playlist}
          isCustomView={isLeeMullicanExhibition}
          displayPreferences={{
            ...(currentItemRef.current?.display ?? {}),
            ...defaultDP1DisplayPreference,
          }}
        />
      </div>
    </>
  );
}
