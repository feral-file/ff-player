'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { AppContext } from '@/context/AppContext';
import { IndexerToken } from '@/models';
import { CastingArtworkType } from '@/models/metric.model';
import ArtworkService from '@/services/ArtworkService';
import { LeeMullican_EXHIBITION_CONTRACT } from '@/utils/constants';
import { getIndexerTokenName } from '@/utils/indexer';
import { calculateStartTime, getIndex } from '@/utils/Playlist';
import { CastCommand, PlayArtworkV2, PlaylistToken } from '@/utils/types';
import { useContext, useEffect, useRef, useState } from 'react';

export default function PlaylistClient() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const { castInfo } = context.websocketData;

  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [isLeeMucianExhibition, setIsLeeMucianExhibition] =
    useState<boolean>(false);

  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const indexRef = useRef<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);

  const startPlayArtworkTime = useRef<number>(0);
  const endPlayArtworkTime = useRef<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>();
  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);
  const currentPlaylistRef = useRef<PlaylistToken>();

  // Services
  const artworkService = useRef(new ArtworkService());

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
    setIsLeeMucianExhibition(
      currentPlaylist.contractAddress === LeeMullican_EXHIBITION_CONTRACT
    );

    const currentTime = Date.now();
    startPlayArtworkTime.current = currentTime;
    endPlayArtworkTime.current = currentTime + currentPlaylist.duration;
    startInterval(currentPlaylist.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, playlist]);

  const handleUpdateDuration = (artworks: PlayArtworkV2[]) => {
    const durationMap = new Map<string, number>();
    artworks.forEach((a: PlayArtworkV2) => {
      if (a.token) {
        durationMap.set(a.token.id, a.duration);
      }
    });
    let index = currentIndex % playlist.length;
    const currentPlaylistItem = playlist[currentIndex];
    const currentArtwork = artworks.find(
      a => a.token?.id === currentPlaylistItem.token.id
    );

    const updatedPlaylist = playlist.map((p: PlaylistToken, i: number) => {
      return {
        ...p,
        duration: artworks[i].duration,
      };
    });

    let startTime = calculateStartTime(updatedPlaylist, index);
    if (currentArtwork) {
      const playTime = Date.now() - startPlayArtworkTime.current;
      if (currentPlaylistItem.duration < currentArtwork.duration) {
        const remainTime = new Date(
          currentPlaylistItem.duration -
            playTime +
            (currentArtwork.duration - currentPlaylistItem.duration)
        ).setMilliseconds(0);
        startTime = calculateStartTime(updatedPlaylist, index, remainTime);
        startInterval(remainTime);
      } else if (currentPlaylistItem.duration > currentArtwork.duration) {
        if (playTime >= currentArtwork.duration) {
          index = (index + 1) % playlist.length;
          startTime = calculateStartTime(updatedPlaylist, index);
        } else {
          const remainTime = new Date(
            currentArtwork.duration - playTime
          ).setMilliseconds(0);
          startTime = calculateStartTime(updatedPlaylist, index, remainTime);
          startInterval(remainTime);
        }
      }
    }

    setStartTime(startTime);
    setPlaylist(updatedPlaylist);
  };

  const handlePauseCasting = () => {
    console.log('handlePauseCasting');
    clearTimer();
    const now = Date.now();
    elapsedTimeRef.current = now - startPlayArtworkTime.current;
    remainTimeRef.current = endPlayArtworkTime.current - now;
  };

  const handleResumeCasting = () => {
    console.log('handleResumeCasting');
    const st = calculateStartTime(
      playlist,
      currentIndex,
      new Date(elapsedTimeRef.current).setMilliseconds(0)
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
      (p: PlaylistToken) => p.token.id === tokenID
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
    if (duration === 0) {
      return;
    }

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

  useEffect(() => {
    console.log('castInfo', castInfo);

    if (castInfo) {
      const handleCastCommand = () => {
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
                const tokensName = new Map<string, string>();
                const contractAddress = new Map<string, string>();
                tokens.forEach((token: IndexerToken) => {
                  previewData.set(
                    token.indexID,
                    token.asset.metadata.project.latest.previewURL
                  );
                  tokensName.set(token.indexID, getIndexerTokenName(token));
                  contractAddress.set(token.indexID, token.contractAddress);
                });
                const updatedArtworks = artworks.map(
                  (artwork: PlayArtworkV2) => {
                    if (artwork.token) {
                      artwork.token.name =
                        tokensName.get(artwork.token.id) ?? '';
                    }

                    const aw: PlaylistToken = {
                      duration: artwork.duration,
                      previewURL:
                        previewData.get(artwork.token?.id ?? '') ?? '',
                      token: artwork.token ?? { id: '', name: '' },
                      contractAddress: contractAddress.get(
                        artwork.token?.id ?? ''
                      ),
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castInfo]);

  useEffect(() => {
    if (context.isOnline && !context.websocketData.isDisconnected) {
      handleResumeCasting();
    } else {
      handlePauseCasting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.isOnline, context.websocketData.isDisconnected]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID}
          castingType={CastingArtworkType.Playlist}
          isCustomView={isLeeMucianExhibition}
        />
      </div>
    </>
  );
}
