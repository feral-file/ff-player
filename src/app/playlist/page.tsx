'use client';

import ArtworkPlayer from '@/components/ArtworkPlayer';
import { AppContext } from '@/context/AppContext';
import { IndexerToken } from '@/models';
import ArtworkService from '@/services/ArtworkService';
import { calculateStartTime, getIndex } from '@/utils/Playlist';
import { CastCommand, PlayArtworkV2, PlaylistToken } from '@/utils/types';
import { useContext, useEffect, useRef, useState } from 'react';

export default function PlayList() {
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const indexRef = useRef<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);

  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const data = context.websocketData;
  const { castInfo } = data;

  const startPlayArtworkTime = useRef<number>(0);
  const endPlayArtworkTime = useRef<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const [startTime, setStartTime] = useState<number>(0);

  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);

  const artworkService = useRef(new ArtworkService());

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (currentIndex < 0) {
      return;
    }

    if (playlist?.length === 0) {
      return;
    }

    if (indexRef.current === currentIndex) {
      return;
    }

    indexRef.current = currentIndex;

    const index = currentIndex % playlist.length;
    const currentPlaylist = playlist[index];
    setCastPreviewURL(currentPlaylist.previewURL);
    const currentTime = Date.now();
    startPlayArtworkTime.current = currentTime;
    endPlayArtworkTime.current = currentTime + currentPlaylist.duration;
    startInterval(currentPlaylist.duration);
  }, [currentIndex, playlist]);

  const handleUpdateDuration = (artworks: PlayArtworkV2[]) => {
    const durationMap = new Map<string, number>();
    artworks.forEach((a: PlayArtworkV2) => {
      durationMap.set(a.id, a.duration);
    });

    const updatedPlaylist = playlist.map((p: PlaylistToken, i: number) => {
      return {
        ...p,
        duration: artworks[i].duration,
      };
    });

    const i = currentIndex % playlist.length;
    let remainTime = Date.now() - startPlayArtworkTime.current;
    const st = calculateStartTime(updatedPlaylist, i, remainTime + 100);
    setStartTime(st);

    setPlaylist(updatedPlaylist);
  };

  const handlePauseCasting = () => {
    clearTimer();
    const now = Date.now();
    elapsedTimeRef.current = now - startPlayArtworkTime.current;
    remainTimeRef.current = endPlayArtworkTime.current - now;
  };

  const handleResumeCasting = () => {
    const st = calculateStartTime(
      playlist,
      currentIndex,
      elapsedTimeRef.current
    );
    setStartTime(st);
    startInterval(remainTimeRef.current);
  };

  const handleNext = () => {
    const i = (currentIndex + 1) % playlist.length;
    const st = calculateStartTime(playlist, i);
    setStartTime(st);
    clearTimer();
    setCurrentIndex(i);
  };

  const handlePrevious = () => {
    let i: number;
    if (currentIndex === 0) {
      i = playlist.length - 1;
    } else {
      i = (currentIndex - 1) % playlist.length;
    }

    const st = calculateStartTime(playlist, i);
    setStartTime(st);
    clearTimer();
    setCurrentIndex(i);
  };

  const handleMoveToArtwork = (tokenID: string) => {
    const index = playlist.findIndex(
      (p: PlaylistToken) => p.token?.id === tokenID
    );
    if (index < 0) {
      return;
    }
    const st = calculateStartTime(playlist, index);
    setStartTime(st);
    clearTimer();
    setCurrentIndex(index);
  };

  const startInterval = (duration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      const i = getIndex(playlist, startTime);
      setCurrentIndex(i);
    }, duration);
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  const resetCastingStatus = () => {
    clearTimer();
    setPlaylist([]);
    setCurrentIndex(-1);
  };

  const refreshData = () => {
    setCurrentIndex(-1);
    indexRef.current = -1;
    setPlaylist([]);
    setStartTime(0);
  };

  useEffect(() => {
    if (castInfo) {
      const handleCastCommand = async () => {
        switch (castInfo.castCommand) {
          case CastCommand.castListArtwork: {
            indexRef.current = -1;
            const getNftTokens = async (ids: string[]) => {
              if (!ids.length) {
                return;
              }
              try {
                const tokens = await artworkService.current.queryTokens(ids);
                const artworks = castInfo.artworks;
                if (!artworks) {
                  return;
                }

                const previewData = new Map<string, string>();
                tokens.forEach((token: IndexerToken) => {
                  previewData.set(
                    token.indexID,
                    token.asset.metadata.project.latest.previewURL
                  );
                });
                const updatedArtworks = artworks.map(
                  (artwork: PlayArtworkV2) => {
                    const aw: PlaylistToken = {
                      duration: artwork.duration,
                      previewURL:
                        previewData.get(artwork.token?.id ?? '') ?? '',
                      token: artwork.token ?? { id: '' },
                    };

                    return aw;
                  }
                );
                setPlaylist(updatedArtworks);
                if (castInfo.startTime) {
                  setStartTime(castInfo.startTime);
                  const i = getIndex(updatedArtworks, castInfo.startTime);
                  setCurrentIndex(i);
                }
              } catch (error) {
                console.log(
                  'Error fetching NFT tokens:',
                  JSON.stringify(error)
                );
              }
            };
            if (castInfo.artworks) {
              const assetIds = castInfo.artworks.map(
                (artwork: PlayArtworkV2) => artwork.token?.id ?? ''
              );
              getNftTokens(assetIds).catch((error: unknown) => {
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
            handleMoveToArtwork(castInfo.value as string);
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
        }
      };
      handleCastCommand();
    } else {
      refreshData();
    }
  }, [castInfo]);

  return (
    <>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ArtworkPlayer previewURL={castPreviewURL!} />
      </div>
    </>
  );
}
