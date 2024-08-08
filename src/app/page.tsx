'use client';

import { useState, useEffect, useRef } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
import useWebSocket from '../utils/WebSocketManager';
import DeviceManager from '../utils/DeviceManager';
import {
  Artwork,
  CastCommand,
  PlayArtworkV2,
  PlaylistToken,
  ViewMode,
} from '@/utils/types';
import ArtworkPlayer from './artworkPlayer';
import HomePage from './homePage';
import OnboardingPage from './onboardingPage';
import ArtworkService from '@/utils/ArtworkService';
import { getIndex } from '@/utils/Playlist';
import ComingSoonPage from './commingSoonPage';
import {
  KeyEvent,
  DeviceName,
  TizenConfigService,
  Config,
} from '@/utils/platform';
import { useSearchParams } from 'next/navigation';

const STANDARD_HEIGHT = 1080;

const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('Unknown Device');
  const { locationID, topicID, castInfo } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );
  const artworkService = useRef(new ArtworkService());
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

  const [startPlayArtworkTime, setStartPlayArtworkTime] = useState<number>(0);
  const [endPlayArtworkTime, setEndPlayArtworkTime] = useState<number>(0);
  const [keyboardCode, setKeyboardCode] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [didRegisterPlatformEvents, setDidRegisterPlatformEvents] =
    useState<boolean>(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const platform = searchParams.get('platform');
      console.log('get platform from query', platform);
      localStorage.setItem('platform', platform as string);
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
        } else {
          setViewMode(ViewMode.landscape);
          minSize = window.innerHeight;
        }

        setScreenRatio(minSize / STANDARD_HEIGHT);
      };

      resizeHandler();
    }
  }, []);

  useEffect(() => {
    if (locationID && topicID) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      DeviceManager.setName(deviceName);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink();
    }
  }, [locationID, topicID]);

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

          case CastCommand.nextArtwork: {
            handleNext();
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

          case CastCommand.nextArtwork: {
            handleNext();
            break;
          }

          case CastCommand.previousArtwork: {
            handlePrevious();
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
    (window as any).AppState.postMessage('loaded');
  } catch (error) {}

  useEffect(() => {
    if (currentIndex < 0) {
      return;
    }

    if (playlist?.length === 0) {
      return;
    }

    const index = currentIndex % playlist.length;
    const currentPlaylist = playlist[index];
    setCastPreviewURL(currentPlaylist.previewURL);
    setCastStatus(true);
    const currentTime = Date.now();
    setStartPlayArtworkTime(currentTime);
    setEndPlayArtworkTime(currentTime + currentPlaylist.duration);
    startInterval(currentPlaylist.duration);

    return () => clearInterval(intervalRef.current);
  }, [currentIndex, playlist]);

  const handleNext = () => {
    const currentTime = Date.now();
    setStartTime(startTime - (currentTime - startPlayArtworkTime));
    clearTimer();
    setCurrentIndex(currentIndex => (currentIndex + 1) % playlist.length);
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

  const handlePrevious = () => {
    const currentTime = Date.now();
    setStartTime(startTime + (currentTime - startPlayArtworkTime));
    clearTimer();

    if (currentIndex === 0) {
      setCurrentIndex(playlist.length - 1);
      return;
    }

    setCurrentIndex(currentIndex => (currentIndex - 1) % playlist.length);
  };

  return (
    <>
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
    </>
  );
};

export default Home;
