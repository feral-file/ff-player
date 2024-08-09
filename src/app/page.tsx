'use client';

import { useState, useEffect, useRef } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
import useWebSocket from '../utils/WebSocketManager';
import DeviceManager from '../utils/DeviceManager';
import {
  Artwork,
  CastCommand,
  Orientation,
  Daily,
  PlayArtworkV2,
  PlaylistToken,
  ViewMode,
} from '@/utils/types';
import ArtworkPlayer from '../components/artworkPlayer';
import HomePage from '../components/homePage';
import OnboardingPage from '../components/onboardingPage';
import ArtworkService from '@/utils/ArtworkService';
import { calculateStartTime, getIndex } from '@/utils/Playlist';
import ComingSoonPage from '../components/comingSoonPage';
import {
  KeyEvent,
  DeviceName,
  TizenConfigService,
  Config,
} from '@/utils/platform';
import DailyService from '@/utils/DailyService';

const STANDARD_HEIGHT = 1080;

const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const { locationID, topicID, castInfo } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );
  const artworkService = useRef(new ArtworkService());
  const dailyService = useRef(new DailyService());
  const startPlayArtworkTime = useRef<number>(0);
  const endPlayArtworkTime = useRef<number>(0);
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.landscape);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [castStatus, setCastStatus] = useState<boolean | null>(false);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [displayComingSoon, setDisplayComingSoon] = useState<boolean>(false);
  const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);

  const [keyboardCode, setKeyboardCode] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [didRegisterPlatformEvents, setDidRegisterPlatformEvents] =
    useState<boolean>(false);
  const [rotateRadius, setRotateRadius] = useState<number>(0);
  const [screenOrientation, setScreenOrientation] = useState<Orientation>(
    Orientation.horizontal
  );
  const indexRef = useRef<number>(-1);
  const elapsedTimeRef = useRef<number>(0);
  const remainTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browser = detect() as BrowserInfo;
      if (browser) {
        setDeviceName(`${browser.os} - ${browser.name} ${browser.version}`);
      }

      const resizeHandler = () => {
        let minSize;
        if (window.innerHeight > window.innerWidth) {
          setViewMode(ViewMode.portrait);
          minSize = window.innerWidth;
          setScreenOrientation(Orientation.vertical);
        } else {
          setViewMode(ViewMode.landscape);
          minSize = window.innerHeight;
          setScreenOrientation(Orientation.horizontal);
        }

        setScreenRatio(minSize / STANDARD_HEIGHT);
      };

      resizeHandler();
    }
  }, []);

  useEffect(() => {
    if (locationID && topicID && deviceName) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      DeviceManager.setName(deviceName);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink();
    }
  }, [locationID, topicID, deviceName]);

  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        const artworks = await artworkService.current.getFeaturedArtworks();
        if (artworks) {
          setArtworks(artworks);
          setCurrentArtwork(artworks[0]);
        }
      } catch (error) {
        console.log('Error fetching artworks:', JSON.stringify(error));
      }
    };
    fetchArtworks();
  }, []);

  useEffect(() => {
    if (artworks.length > 0) {
      let index = 0;
      const interval = setInterval(() => {
        setCurrentArtwork(artworks[index]);
        index = (index + 1) % artworks.length;
      }, 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [artworks]);

  useEffect(() => {
    if (castInfo) {
      const handleCastCommand = async () => {
        console.log('--------------');
        console.log('Cast Command:', JSON.stringify(castInfo));
        console.log('--------------');

        switch (castInfo.castCommand) {
          case CastCommand.castListArtwork: {
            setDisplayComingSoon(false); // Temporary display coming soon
            setDisplayOnboarding(false);
            const getNftTokens = async (ids: string[]) => {
              if (!ids.length) {
                return;
              }
              try {
                const data = await artworkService.current.queryTokens(ids);
                const artworks = castInfo?.artworks;
                if (!artworks) {
                  return;
                }

                if (data) {
                  const previewData: Map<string, string> = new Map();
                  data.tokens.forEach((token: any) => {
                    previewData.set(
                      token.indexID,
                      token.asset.metadata.project.latest.previewURL
                    );
                  });
                  const updatedArtworks = artworks.map((artwork: any) => {
                    return {
                      ...artwork,
                      previewURL: previewData.get(artwork.token.id),
                    };
                  });
                  setPlaylist(updatedArtworks);
                  if (castInfo.startTime) {
                    setStartTime(castInfo.startTime);
                    const i = getIndex(updatedArtworks, castInfo?.startTime);
                    setCurrentIndex(i);
                  }
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
                (artwork: any) => artwork.token.id
              );
              getNftTokens(assetIds);
            }
            break;
          }

          case CastCommand.castExhibition: {
            // Temporary display coming soon
            setDisplayComingSoon(true);
            setTimeout(() => {
              setDisplayComingSoon(false);
            }, 1000 * 15);
            break;
          }

          case CastCommand.sendKeyboardEvent: {
            console.log('Keyboard Event:', castInfo.value);
            setKeyboardCode(castInfo.value);
            break;
          }

          case CastCommand.connect: {
            if (
              !(await DeviceManager.isPreviouslyConnectedDevice(
                castInfo?.deviceInfo?.device_id
              ))
            ) {
              setDisplayOnboarding(true);
              DeviceManager.addPreviouslyConnectedDeviceId(
                castInfo?.deviceInfo?.device_id
              );
            }
            break;
          }

          case CastCommand.castDaily: {
            handleCastDaily();
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
            handleMoveToArtwork(castInfo.value);
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
          case CastCommand.rotate: {
            setViewMode(
              viewMode === ViewMode.landscape
                ? ViewMode.portrait
                : ViewMode.landscape
            );
            setRotateRadius(rotateRadius + 90);

            break;
          }
        }
      };
      handleCastCommand();
    } else {
      setCastStatus(false);
    }
  }, [castInfo]);

  useEffect(() => {
    (window as any).KeyEvent = {
      handlePlatformEvent: KeyEvent.handlePlatformEvent,
    };
    (window as any).DeviceName = {
      handlePlatformEvent: DeviceName.handlePlatformEvent,
    };
    (window as any).Config = {
      handlePlatformEvent: Config.handlePlatformEvent,
    };
    setDidRegisterPlatformEvents(true);
  }, []);

  try {
    (window as any).AppState?.postMessage('loaded');
  } catch (error) {}

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
    setCastStatus(true);
    const currentTime = Date.now();
    startPlayArtworkTime.current = currentTime;
    endPlayArtworkTime.current = currentTime + currentPlaylist.duration;
    startInterval(currentPlaylist.duration);
  }, [currentIndex, playlist]);

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

  // Handle cast daily
  const handleCastDaily = async () => {
    const daily = await dailyService.current.getUpcomingDaily();
    if (!daily) {
      return;
    }
    const ids = daily.map((d: Daily) => {
      switch (d.blockchain) {
        case 'ethereum': {
          return `eth-${d.contractAddress}-${d.tokenID}`;
        }

        case 'bitmark': {
          return `bmk--${d.tokenID}`;
        }

        case 'tezos': {
          return `tez-${d.contractAddress}-${d.tokenID}`;
        }

        default: {
          return '';
        }
      }
    });

    if (ids.length === 0) {
      return;
    }

    const data = await artworkService.current.queryTokens(ids);
    const previewData: Map<string, string> = new Map();
    data.tokens.forEach((token: any) => {
      previewData.set(token.id, token.asset.metadata.project.latest.previewURL);
    });

    const dailies = daily.map((d: Daily) => {
      return {
        ...d,
        previewURL: previewData.get(d.tokenID),
      };
    });

    if (dailies.length > 0) {
      const now = Date.now();
      const currentDisplayTime = new Date(dailies[0].displayTime);
      let nextDisplayTime = currentDisplayTime.setDate(
        currentDisplayTime.getDate() + 1
      );
      if (dailies.length > 1 && dailies[1].displayTime) {
        nextDisplayTime = new Date(dailies[1].displayTime).getTime();
      }

      const delay = nextDisplayTime - now;
      if (dailies[0].previewURL) {
        setCastPreviewURL(dailies[0].previewURL);
        setCastStatus(true);
      }

      const interval = setInterval(() => {
        handleCastDaily();
      }, delay);

      return () => clearInterval(interval);
    }
  };

  return (
    <div
      style={{
        width:
          (screenOrientation === Orientation.vertical &&
            rotateRadius % 180 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            rotateRadius % 180 === 0)
            ? '100vw'
            : '100vh',
        height:
          (screenOrientation === Orientation.vertical &&
            rotateRadius % 180 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            rotateRadius % 180 === 0)
            ? '100vh'
            : '100vw',
        transform: `rotate(${-rotateRadius}deg) `,
        transformOrigin: `${
          (screenOrientation === Orientation.vertical &&
            rotateRadius % 360 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            rotateRadius % 360 !== 90)
            ? '50vw center'
            : 'center 50vh'
        }`,
        transition: 'all 0.2s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      {displayComingSoon && <ComingSoonPage screenRatio={screenRatio} />}
      {displayOnboarding && (
        <OnboardingPage
          screenRatio={screenRatio}
          branchLink={branchLink!}
          connectedDeviceName={castInfo?.deviceInfo?.device_name}
          displayName={deviceName!}
        />
      )}
      {castStatus ? (
        <div style={{ width: '100vw', height: '100vh' }}>
          <ArtworkPlayer
            previewURL={castPreviewURL!}
            keyboardCode={keyboardCode}
          />
        </div>
      ) : (
        <HomePage
          screenRatio={screenRatio}
          viewMode={viewMode}
          deviceName={deviceName!}
          branchLink={branchLink!}
          currentArtwork={currentArtwork!}
        />
      )}
    </div>
  );
};

export default Home;
