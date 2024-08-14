'use client';

import React, { useState, useEffect, useRef, useContext } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
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
import { calculateStartTime, getIndex } from '@/utils/Playlist';
import ExhibitionHall from './exhibitions/exhibitionPlayer';
import MessageModal from '../components/messageModal';
import { KeyEvent, DeviceName, Config } from '@/utils/platform';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { AppSettings } from '@/constants';
import AppService from '@/services/app.service';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppContext } from '@/context/AppContext';
import ArtworkService from '@/services/ArtworkService';
import DailyService from '@/services/DailyService';
import { IndexerToken } from '@/models';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
}

const STANDARD_HEIGHT = 1080;

const Home: React.FC = () => {
  const router = useRouter();
  const pathName = usePathname();

  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');

  // Services
  const artworkService = useRef(new ArtworkService());

  // States
  const [castState, setCastState] = useState<CastState>(CastState.None);
  const dailyService = useRef(new DailyService());
  const startPlayArtworkTime = useRef<number>(0);
  const endPlayArtworkTime = useRef<number>(0);
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [displayComingSoon, setDisplayComingSoon] = useState<boolean>(false);
  const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);

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
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const query = useSearchParams();

  // Context
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const data = context.data;
  const { locationID, topicID, castInfo } = data;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const platform = query.get('platform') ?? '';
    localStorage.setItem('platform', platform);
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handleKeyDown = () => {
      console.log('Key pressed');
      setTimeout(() => {
        router.push('/daily');
      }, 100);
    };

    EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    EventEmitter.subscribe(Event.keyDown, handleKeyDown);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    };
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    function updateNetworkStatus() {
      setIsOnline(navigator.onLine);
    }

    if (typeof window !== 'undefined') {
      const browser = detect() as BrowserInfo | null;
      if (browser) {
        setDeviceName(
          `${browser.os ?? ''} - ${browser.name} ${browser.version}`
        );
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

      window.addEventListener('online', updateNetworkStatus);
      window.addEventListener('offline', updateNetworkStatus);

      return () => {
        window.removeEventListener('online', updateNetworkStatus);
        window.removeEventListener('offline', updateNetworkStatus);
      };
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (locationID && topicID && deviceName) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink().catch((error: unknown) => {
        console.error(error);
      });
    }
  }, [locationID, topicID, deviceName]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        const artworks = await artworkService.current.getFeaturedArtworks();
        if (artworks.length === 0) {
          return;
        }

        setArtworks(artworks);
        setCurrentArtwork(artworks[0]);
      } catch (error) {
        console.log('Error fetching artworks:', JSON.stringify(error));
      }
    };
    fetchArtworks().catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (artworks.length > 0) {
      let index = 0;
      const interval = setInterval(() => {
        setCurrentArtwork(artworks[index]);
        index = (index + 1) % artworks.length;
      }, 60 * 1000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [artworks]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
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

          case CastCommand.castExhibition: {
            resetCastingStatus();
            castExhibition();
            break;
          }

          case CastCommand.sendKeyboardEvent: {
            console.log('Keyboard Event:', castInfo.value);
            break;
          }

          case CastCommand.connect: {
            if (
              !(await DeviceManager.isPreviouslyConnectedDevice(
                castInfo.deviceInfo?.deviceId ?? ''
              ))
            ) {
              setDisplayOnboarding(true);
              await DeviceManager.addPreviouslyConnectedDeviceId(
                castInfo.deviceInfo?.deviceId ?? ''
              );
            }
            break;
          }

          case CastCommand.castDaily: {
            await handleCastDaily();
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
      handleCastCommand().catch((error: unknown) => {
        console.error(error);
      });
    } else {
      refreshData();
    }
  }, [castInfo]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).KeyEvent = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: KeyEvent.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).DeviceName = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: DeviceName.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).Config = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: Config.handlePlatformEvent,
      };
    }

    setDidRegisterPlatformEvents(true);
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (didRegisterPlatformEvents) {
      console.log('Registering platform events');
      DeviceManager.getName()
        .then(name => {
          console.log('Device Name:', name);
          setDeviceName(name);
        })
        .catch((error: unknown) => {
          console.error(error);
        });
    }
  }, [didRegisterPlatformEvents]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
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
    setCastPreviewURL(currentPlaylist.previewURL);
    setCastState(CastState.Artwork);
    const currentTime = Date.now();
    startPlayArtworkTime.current = currentTime;
    endPlayArtworkTime.current = currentTime + currentPlaylist.duration;
    startInterval(currentPlaylist.duration);
  }, [currentIndex, playlist]);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const appState = (window as any).AppState;
    if (appState) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      appState.postMessage(
        JSON.stringify({
          handler: 'loaded',
        })
      );
    }
  } catch (error) {
    console.error(error);
  }

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
    const remainTime = Date.now() - startPlayArtworkTime.current;
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

  const resetCastingStatus = () => {
    clearTimer();
    setPlaylist([]);
    setCurrentIndex(-1);
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
    try {
      const daily = await dailyService.current.getUpcomingDaily();

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
      const previewData = new Map<string, string>();
      data.forEach((token: IndexerToken) => {
        previewData.set(
          token.id,
          token.asset.metadata.project.latest.previewURL
        );
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
          setCastState(CastState.Artwork);
        }

        const interval = setInterval(() => {
          handleCastDaily().catch((error: unknown) => {
            console.error(error);
          });
        }, delay);

        return () => {
          clearInterval(interval);
        };
      }
    } catch (error) {
      console.error(error);
    }
  };

  const refreshData = () => {
    setCastState(CastState.None);
    setCurrentIndex(-1);
    indexRef.current = -1;
    setPlaylist([]);
    setStartTime(0);
  };

  const checkVersion = async () => {
    const currentVersion = await AppService.getCurrentVersion();
    const newVersion = await AppService.getVersion();
    console.log('Current Version:', currentVersion);
    console.log('New Version:', newVersion);
    if (newVersion !== currentVersion) {
      window.location.reload();
    }
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const validateVersion = async () => {
      await checkVersion();
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const intervalID = setInterval(async () => {
        await checkVersion();
      }, AppSettings.VERSION_CHECK_INTERVAL_DURATION);

      return () => {
        clearInterval(intervalID);
      };
    };

    validateVersion().catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (castInfo?.dataChecked && !castInfo.castCommand) {
      handleNavigateDaily();
    }
  }, [castInfo]);

  const castExhibition = () => {
    setCastState(CastState.Exhibition);
  };

  const handleNavigateDaily = () => {
    const isFirstOpenQuery = query.get('isFirstOpen');
    if (isFirstOpenQuery === 'false') {
      AppService.setIsFirstOpen(false);
      return;
    }

    const isFirstOpen = AppService.getIsFirstOpen(pathName);
    if (isFirstOpen) {
      AppService.setIsFirstOpen(false);
      router.replace('/?isFirstOpen=false');
      setTimeout(() => {
        router.push('/daily');
      }, 100);
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
        transform: `rotate(${(-rotateRadius).toString()}deg) `,
        transformOrigin:
          (screenOrientation === Orientation.vertical &&
            rotateRadius % 360 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            rotateRadius % 360 !== 90)
            ? '50vw center'
            : 'center 50vh',
        transition: 'transform 0.2s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      {displayComingSoon && (
        <MessageModal screenRatio={screenRatio} message="Coming soon..." />
      )}
      {!isOnline && (
        <MessageModal
          screenRatio={screenRatio}
          message="Internet connection lost. Reconnecting..."
        />
      )}
      {displayOnboarding && (
        <OnboardingPage
          screenRatio={screenRatio}
          branchLink={branchLink ?? ''}
          connectedDeviceName={castInfo?.deviceInfo?.deviceName ?? ''}
          displayName={deviceName}
        />
      )}
      {castState === CastState.None && (
        <HomePage
          screenRatio={screenRatio}
          viewMode={viewMode ?? ViewMode.portrait}
          deviceName={deviceName}
          branchLink={branchLink ?? ''}
          currentArtwork={currentArtwork ?? undefined}
        />
      )}
      {castState === CastState.Artwork && (
        <div style={{ width: '100vw', height: '100vh' }}>
          <ArtworkPlayer previewURL={castPreviewURL ?? ''} />
        </div>
      )}
      {castState === CastState.Exhibition && (
        <ExhibitionHall
          viewMode={viewMode ?? ViewMode.portrait}
          screenRatio={screenRatio}
          exhibitionID={castInfo?.exhibitionId}
          catalogID={castInfo?.catalogId}
          screen={castInfo?.catalog}
        />
      )}
    </div>
  );
};

export default Home;
