'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { useAppContext } from '@/context/AppContext';
import { IndexerToken } from '@/models';
import { CastingArtworkType } from '@/models/metric.model';
import ArtworkService from '@/services/ArtworkService';
import CanvasService from '@/services/CanvasService';
import { LeeMullican_EXHIBITION_CONTRACT } from '@/utils/constants';
import { getIndex } from '@/utils/playlist';
import { PlayArtwork, PlaylistToken, CastCommand } from '@/models';
import { useEffect, useRef, useState } from 'react';

export default function PlaylistClient() {
  const { context } = useAppContext();
  const castInfo = context.castInfo;

  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [isLeeMullicanExhibition, setIsLeeMullicanExhibition] =
    useState<boolean>(false);

  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const indexRef = useRef<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>();
  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);
  const currentPlaylistRef = useRef<PlaylistToken>();

  // Services
  const artworkService = useRef(new ArtworkService());
  const canvasService = useRef(CanvasService.getInstance());

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
    const currentPlaylist = playlist[index];
    if (currentPlaylist !== currentPlaylistRef.current) {
      currentPlaylistRef.current = currentPlaylist;
      setArtworkID(currentPlaylist.token.id);
    }
    setCastPreviewURL(currentPlaylist.previewURL);
    setIsLeeMullicanExhibition(
      currentPlaylist.contractAddress === LeeMullican_EXHIBITION_CONTRACT
    );

    if (!castInfo?.isPaused) {
      startInterval(currentPlaylist.duration);
    }
  }, [currentIndex, playlist]);

  const handleUpdateDuration = (artworks: PlayArtwork[]) => {
    const durationMap = new Map<string, number>();
    artworks.forEach((a: PlayArtwork) => {
      if (a.token) {
        durationMap.set(a.token.id, a.duration);
      }
    });

    const updatedPlaylist = playlist.map((p: PlaylistToken, i: number) => {
      return {
        ...p,
        duration: artworks[i].duration,
      };
    });

    const startTime = castInfo?.startTime ?? Date.now();
    const currentPlaylistItem = playlist[currentIndex];
    const currentArtwork = artworks.find(
      a => a.token?.id === currentPlaylistItem.token.id
    );
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
      canvasService.current.setCastInfo({
        ...castInfo,
        castCommand: CastCommand.updateIndex,
        index,
      });
    }, duration);
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  const getNftTokens = async (
    artworks: PlayArtwork[]
  ): Promise<PlaylistToken[]> => {
    try {
      const assetIds = artworks.map(
        (artwork: PlayArtwork) => artwork.token?.id ?? ''
      );
      const tokens = await artworkService.current.queryTokens(assetIds);
      const previewData = new Map<string, string>();
      const contractAddress = new Map<string, string>();
      const mapTokens = new Map<string, IndexerToken>();
      tokens.forEach((token: IndexerToken) => {
        previewData.set(
          token.indexID,
          token.asset?.metadata.project.latest.previewURL ?? ''
        );
        contractAddress.set(token.indexID, token.contractAddress);
        mapTokens.set(token.indexID, token);
      });
      const updatedArtworks = artworks.map((artwork: PlayArtwork) => {
        const aw: PlaylistToken = {
          duration: artwork.duration,
          previewURL: previewData.get(artwork.token?.id ?? '') ?? '',
          token: artwork.token ?? { id: '' },
          contractAddress: contractAddress.get(artwork.token?.id ?? ''),
          indexerToken: mapTokens.get(artwork.token?.id ?? ''),
        };
        return aw;
      });
      return updatedArtworks;
    } catch (error) {
      console.log('Error fetching NFT tokens:', JSON.stringify(error));
      return [];
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
            if (castInfo.artworks?.length) {
              getNftTokens(castInfo.artworks)
                .then((updatedArtworks: PlaylistToken[]) => {
                  setPlaylist(updatedArtworks);

                  if (castInfo.startTime) {
                    setStartTime(castInfo.startTime);
                    const i = getIndex(updatedArtworks, castInfo.startTime);
                    setCurrentIndex(i);
                  }

                  if (castInfo.isPaused) {
                    handlePauseCasting();
                  }
                })
                .catch((error: unknown) => {
                  console.error(error);
                });
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
            if (castInfo.artworks) {
              handleUpdateDuration(castInfo.artworks);
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
        />
      </div>
    </>
  );
}
