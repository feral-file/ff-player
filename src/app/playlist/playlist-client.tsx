'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { CastingArtworkType } from '@/models/metric.model';
import { getIndex } from '@/utils/playlist';
import { CastCommand } from '@/models';
import { useEffect, useRef, useState } from 'react';
import { defaultDP1DisplayPreference, DP1Item } from '@/models/dp1.model';
import { LEE_MULLICAN_EXHIBITION_CONTRACT } from '@/constants';
import { convertToTokenID } from '@/utils/indexer';
import { DP1Service } from '@/services/DP1Service';
import CanvasService from '@/services/CanvasService';

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
      startInterval(currentItem.duration);
    }
  }, [currentIndex, playlist]);

  const fetchItemPreviewURL = async (item: DP1Item) => {
    const itemPreview = await DP1Service.getItemPreviewURL(item);
    setCastPreviewURL(itemPreview);
  };

  const handleUpdateDuration = (dp1Items: DP1Item[]) => {
    const durationMap = new Map<string, number>();
    dp1Items.forEach((a: DP1Item) => {
      durationMap.set(a.id, a.duration);
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
      startInterval(currentArtwork.duration);
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
    if (duration === 0 && castInfo?.artworks?.length && currentIndex >= 0) {
      duration = castInfo.artworks[currentIndex].duration;
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

  const startInterval = (duration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (duration === 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      const index = getIndex(playlist, startTime);
      CanvasService.setCastInfo({
        ...castInfo,
        castCommand: CastCommand.updateIndex,
        index,
      });
    }, duration * 1000);
  };

  const clearTimer = () => {
    console.log('clearTimer');
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
          case CastCommand.castListArtwork: {
            indexRef.current = -1;
            setCurrentIndex(-1);

            if (castInfo.items?.length) {
              setPlaylist(castInfo.items);
              if (castInfo.startTime) {
                setStartTime(castInfo.startTime);
                console.log('castInfo.startTime', castInfo.startTime);
                const i = getIndex(castInfo.items, castInfo.startTime);
                console.log('index', i);
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
            if (castInfo.items) {
              handleUpdateDuration(castInfo.items);
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
