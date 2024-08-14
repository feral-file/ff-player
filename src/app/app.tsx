'use client';

import React, { useState, useEffect, useRef, useContext } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
import DeviceManager from '../utils/DeviceManager';
import {
  Artwork,
  CastCommand,
  Daily,
  PlayArtworkV2,
  PlaylistToken,
} from '@/utils/types';
import ArtworkPlayer from '../components/ArtworkPlayer';
import { calculateStartTime, getIndex } from '@/utils/Playlist';
import ExhibitionHall from './exhibitions/exhibitionPlayer';
import { KeyEvent, DeviceName, Config } from '@/utils/platform';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { AppSettings } from '@/constants';
import AppService from '@/services/app.service';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppContext } from '@/context/AppContext';
import ArtworkService from '@/services/ArtworkService';
import DailyService from '@/services/DailyService';
import HomePage from '@/components/homePage';

// const enum CastState {
//   None, // Not casting
//   Artwork, // Displaying artwork, playlist, dallies
//   Exhibition, // Displaying exhibition
// }

const App: React.FC = () => {
  // const context = useContext(AppContext);
  // if (!context) {
  //   return <p>There is no context.</p>;
  // }

  // const data = context.data;
  // const { locationID, topicID, castInfo, canvasService } = data;

  // const router = useRouter();
  // const pathName = usePathname();

  // const [branchLink, setBranchLink] = useState<string | null>(null);
  // const [deviceName, setDeviceName] = useState<string>('');

  // Services
  // const artworkService = useRef(new ArtworkService());

  // States
  // const [castState, setCastState] = useState<CastState>(CastState.None);
  // const dailyService = useRef(new DailyService());
  // const startPlayArtworkTime = useRef<number>(0);
  // const endPlayArtworkTime = useRef<number>(0);
  // const [artworks, setArtworks] = useState<Artwork[]>([]);
  // const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  // // const [castStatus, setCastStatus] = useState<boolean | null>(false);
  // const castStatusRef = useRef(false);
  // const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  // const [currentIndex, setCurrentIndex] = useState<number>(-1);
  // const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  // const [startTime, setStartTime] = useState<number>(0);
  // const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);

  // const [keyboardCode, setKeyboardCode] = useState<number>(0);
  // const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
  //   undefined
  // );
  // const [didRegisterPlatformEvents, setDidRegisterPlatformEvents] =
  //   useState<boolean>(false);
  // const indexRef = useRef<number>(-1);
  // const elapsedTimeRef = useRef<number>(0);
  // const remainTimeRef = useRef<number>(0);

  // const query = useSearchParams();
  // useEffect(() => {
  //   const platform = query?.get('platform') ?? '';
  //   localStorage.setItem('platform', platform);
  // });

  // useEffect(() => {
  //   castStatusRef.current = castState !== CastState.None;
  //   try {
  //     (window as any).AppState.postMessage(
  //       JSON.stringify({
  //         handler: 'backAbleChanged',
  //         data: castStatusRef.current,
  //       })
  //     );
  //   } catch (error) {}
  // }, [castState]);

  // useEffect(() => {
  //   const handleEscapeKey = () => {
  //     console.log('Escape key pressed');
  //     if (castStatusRef.current) {
  //       refreshData();
  //       if (canvasService?.current != null) {
  //         canvasService?.current?.disconnect({});
  //       }
  //       clearTimer();
  //     }
  //   };

  //   EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
  //   EventEmitter.subscribe(Event.escape, handleEscapeKey);

  //   // Cleanup the event listener on component unmount
  //   return () => {
  //     EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
  //   };
  // }, []);

  // useEffect(() => {
  //   if (locationID && topicID && deviceName) {
  //     DeviceManager.setLocationId(locationID);
  //     DeviceManager.setTopicId(topicID);
  //     const generateBranchLink = async () => {
  //       const url = await DeviceManager.getOrGenerateBranchLink();
  //       setBranchLink(url);
  //     };
  //     generateBranchLink();
  //   }
  // }, [locationID, topicID, deviceName]);

  // useEffect(() => {
  //   const fetchArtworks = async () => {
  //     try {
  //       const artworks = await artworkService.current.getFeaturedArtworks();
  //       if (artworks) {
  //         setArtworks(artworks);
  //         setCurrentArtwork(artworks[0]);
  //       }
  //     } catch (error) {
  //       console.log('Error fetching artworks:', JSON.stringify(error));
  //     }
  //   };
  //   fetchArtworks();
  // }, []);

  // useEffect(() => {
  //   if (artworks.length > 0) {
  //     let index = 0;
  //     const interval = setInterval(() => {
  //       setCurrentArtwork(artworks[index]);
  //       index = (index + 1) % artworks.length;
  //     }, 60 * 1000);

  //     return () => clearInterval(interval);
  //   }
  // }, [artworks]);

  // useEffect(() => {
  //   if (castInfo) {
  //     const handleCastCommand = async () => {
  //       console.log('--------------');
  //       console.log('Cast Command:', JSON.stringify(castInfo));
  //       console.log('--------------');

  //       switch (castInfo.castCommand) {
  //         case CastCommand.castListArtwork: {
  //           setDisplayOnboarding(false);
  //           indexRef.current = -1;
  //           const getNftTokens = async (ids: string[]) => {
  //             if (!ids.length) {
  //               return;
  //             }
  //             try {
  //               const data = await artworkService.current.queryTokens(ids);
  //               const artworks = castInfo?.artworks;
  //               if (!artworks) {
  //                 return;
  //               }

  //               if (data) {
  //                 const previewData: Map<string, string> = new Map();
  //                 data.tokens.forEach((token: any) => {
  //                   previewData.set(
  //                     token.indexID,
  //                     token.asset.metadata.project.latest.previewURL
  //                   );
  //                 });
  //                 const updatedArtworks = artworks.map((artwork: any) => {
  //                   return {
  //                     ...artwork,
  //                     previewURL: previewData.get(artwork.token.id),
  //                   };
  //                 });
  //                 setPlaylist(updatedArtworks);
  //                 if (castInfo.startTime) {
  //                   setStartTime(castInfo.startTime);
  //                   const i = getIndex(updatedArtworks, castInfo?.startTime);
  //                   setCurrentIndex(i);
  //                 }
  //               }
  //             } catch (error) {
  //               console.log(
  //                 'Error fetching NFT tokens:',
  //                 JSON.stringify(error)
  //               );
  //             }
  //           };
  //           if (castInfo.artworks) {
  //             const assetIds = castInfo.artworks.map(
  //               (artwork: any) => artwork.token.id
  //             );
  //             getNftTokens(assetIds);
  //           }
  //           break;
  //         }

  //         case CastCommand.castExhibition: {
  //           resetCastingStatus();
  //           castExhibition();
  //           break;
  //         }

  //         case CastCommand.sendKeyboardEvent: {
  //           console.log('Keyboard Event:', castInfo.value);
  //           setKeyboardCode(castInfo.value);
  //           break;
  //         }

  //         case CastCommand.connect: {
  //           if (
  //             !(await DeviceManager.isPreviouslyConnectedDevice(
  //               castInfo?.deviceInfo?.device_id
  //             ))
  //           ) {
  //             setDisplayOnboarding(true);
  //             DeviceManager.addPreviouslyConnectedDeviceId(
  //               castInfo?.deviceInfo?.device_id
  //             );
  //           }
  //           break;
  //         }

  //         case CastCommand.castDaily: {
  //           handleCastDaily();
  //           break;
  //         }

  //         case CastCommand.nextArtwork: {
  //           handleNext();
  //           break;
  //         }

  //         case CastCommand.previousArtwork: {
  //           handlePrevious();
  //           break;
  //         }

  //         case CastCommand.moveToArtwork: {
  //           handleMoveToArtwork(castInfo.value);
  //           break;
  //         }

  //         case CastCommand.updateDuration: {
  //           if (castInfo.artworks) {
  //             handleUpdateDuration(castInfo.artworks);
  //           }
  //           break;
  //         }

  //         case CastCommand.pauseCasting: {
  //           handlePauseCasting();
  //           break;
  //         }

  //         case CastCommand.resumeCasting: {
  //           handleResumeCasting();
  //           break;
  //         }
  //         case CastCommand.rotate: {
  //           break;
  //         }
  //       }
  //     };
  //     handleCastCommand();
  //   } else {
  //     refreshData();
  //   }
  // }, [castInfo]);

  // useEffect(() => {
  //   (window as any).KeyEvent = {
  //     handlePlatformEvent: KeyEvent.handlePlatformEvent,
  //   };
  //   (window as any).DeviceName = {
  //     handlePlatformEvent: DeviceName.handlePlatformEvent,
  //   };
  //   (window as any).Config = {
  //     handlePlatformEvent: Config.handlePlatformEvent,
  //   };
  //   setDidRegisterPlatformEvents(true);
  // }, []);

  // useEffect(() => {
  //   if (didRegisterPlatformEvents) {
  //     console.log('Registering platform events');
  //     DeviceManager.getName().then(name => {
  //       console.log('Device Name:', name);
  //       setDeviceName(name);
  //     });
  //   }
  // }, [didRegisterPlatformEvents]);

  // try {
  //   (window as any).AppState.postMessage(
  //     JSON.stringify({
  //       handler: 'loaded',
  //     })
  //   );
  // } catch (error) {}

  // useEffect(() => {
  //   if (currentIndex < 0) {
  //     return;
  //   }

  //   if (playlist?.length === 0) {
  //     return;
  //   }

  //   if (indexRef.current === currentIndex) {
  //     return;
  //   }

  //   indexRef.current = currentIndex;

  //   const index = currentIndex % playlist.length;
  //   const currentPlaylist = playlist[index];
  //   setCastPreviewURL(currentPlaylist.previewURL);
  //   setCastState(CastState.Artwork);
  //   const currentTime = Date.now();
  //   startPlayArtworkTime.current = currentTime;
  //   endPlayArtworkTime.current = currentTime + currentPlaylist.duration;
  //   startInterval(currentPlaylist.duration);
  // }, [currentIndex, playlist]);

  // const handleNext = () => {
  //   const i = (currentIndex + 1) % playlist.length;
  //   const st = calculateStartTime(playlist, i);
  //   setStartTime(st);
  //   clearTimer();
  //   setCurrentIndex(i);
  // };

  // const handlePrevious = () => {
  //   let i: number;
  //   if (currentIndex === 0) {
  //     i = playlist.length - 1;
  //   } else {
  //     i = (currentIndex - 1) % playlist.length;
  //   }

  //   const st = calculateStartTime(playlist, i);
  //   setStartTime(st);
  //   clearTimer();
  //   setCurrentIndex(i);
  // };

  // const handleUpdateDuration = (artworks: PlayArtworkV2[]) => {
  //   const durationMap = new Map<string, number>();
  //   artworks.forEach((a: PlayArtworkV2) => {
  //     durationMap.set(a.id, a.duration);
  //   });

  //   const updatedPlaylist = playlist.map((p: PlaylistToken, i: number) => {
  //     return {
  //       ...p,
  //       duration: artworks[i].duration,
  //     };
  //   });

  //   const i = currentIndex % playlist.length;
  //   let remainTime = Date.now() - startPlayArtworkTime.current;
  //   const st = calculateStartTime(updatedPlaylist, i, remainTime + 100);
  //   setStartTime(st);

  //   setPlaylist(updatedPlaylist);
  // };

  // const handlePauseCasting = () => {
  //   clearTimer();
  //   const now = Date.now();
  //   elapsedTimeRef.current = now - startPlayArtworkTime.current;
  //   remainTimeRef.current = endPlayArtworkTime.current - now;
  // };

  // const handleResumeCasting = () => {
  //   const st = calculateStartTime(
  //     playlist,
  //     currentIndex,
  //     elapsedTimeRef.current
  //   );
  //   setStartTime(st);
  //   startInterval(remainTimeRef.current);
  // };

  // const handleMoveToArtwork = (tokenID: string) => {
  //   const index = playlist.findIndex(
  //     (p: PlaylistToken) => p.token?.id === tokenID
  //   );
  //   if (index < 0) {
  //     return;
  //   }
  //   const st = calculateStartTime(playlist, index);
  //   setStartTime(st);
  //   clearTimer();
  //   setCurrentIndex(index);
  // };

  // const resetCastingStatus = () => {
  //   clearTimer();
  //   setPlaylist([]);
  //   setCurrentIndex(-1);
  // };

  // const startInterval = (duration: number) => {
  //   if (intervalRef.current) {
  //     clearInterval(intervalRef.current);
  //   }
  //   intervalRef.current = setInterval(() => {
  //     const i = getIndex(playlist, startTime);
  //     setCurrentIndex(i);
  //   }, duration);
  // };

  // const clearTimer = () => {
  //   if (intervalRef.current) {
  //     clearInterval(intervalRef.current);
  //     intervalRef.current = undefined;
  //   }
  // };

  // Handle cast daily
  // const handleCastDaily = async () => {
  //   const daily = await dailyService.current.getUpcomingDaily();
  //   if (!daily) {
  //     return;
  //   }
  //   const ids = daily.map((d: Daily) => {
  //     switch (d.blockchain) {
  //       case 'ethereum': {
  //         return `eth-${d.contractAddress}-${d.tokenID}`;
  //       }

  //       case 'bitmark': {
  //         return `bmk--${d.tokenID}`;
  //       }

  //       case 'tezos': {
  //         return `tez-${d.contractAddress}-${d.tokenID}`;
  //       }

  //       default: {
  //         return '';
  //       }
  //     }
  //   });

  //   if (ids.length === 0) {
  //     return;
  //   }

  //   const data = await artworkService.current.queryTokens(ids);
  //   const previewData: Map<string, string> = new Map();
  //   data.tokens.forEach((token: any) => {
  //     previewData.set(token.id, token.asset.metadata.project.latest.previewURL);
  //   });

  //   const dailies = daily.map((d: Daily) => {
  //     return {
  //       ...d,
  //       previewURL: previewData.get(d.tokenID),
  //     };
  //   });

  //   if (dailies.length > 0) {
  //     const now = Date.now();
  //     const currentDisplayTime = new Date(dailies[0].displayTime);
  //     let nextDisplayTime = currentDisplayTime.setDate(
  //       currentDisplayTime.getDate() + 1
  //     );
  //     if (dailies.length > 1 && dailies[1].displayTime) {
  //       nextDisplayTime = new Date(dailies[1].displayTime).getTime();
  //     }

  //     const delay = nextDisplayTime - now;
  //     if (dailies[0].previewURL) {
  //       setCastPreviewURL(dailies[0].previewURL);
  //       setCastState(CastState.Artwork);
  //     }

  //     const interval = setInterval(() => {
  //       handleCastDaily();
  //     }, delay);

  //     return () => clearInterval(interval);
  //   }
  // };

  // const refreshData = () => {
  //   setCastState(CastState.None);
  //   setCurrentIndex(-1);
  //   indexRef.current = -1;
  //   setArtworks([]);
  //   setCurrentArtwork(null);
  //   setPlaylist([]);
  //   setStartTime(0);
  // };

  // const checkVersion = async () => {
  //   const currentVersion = await AppService.getCurrentVersion();
  //   const newVersion = await AppService.getVersion();
  //   console.log('Current Version:', currentVersion);
  //   console.log('New Version:', newVersion);
  //   if (newVersion !== currentVersion) {
  //     window.location.reload();
  //   }
  // };

  // useEffect(() => {
  //   checkVersion();
  //   const intervalID = setInterval(async () => {
  //     checkVersion();
  //   }, AppSettings.VERSION_CHECK_INTERVAL_DURATION);

  //   return () => clearInterval(intervalID);
  // }, []);

  // const castExhibition = async () => {
  //   setCastState(CastState.Exhibition);
  // };

  // useEffect(() => {
  //   if (castInfo?.dataChecked && !castInfo?.castCommand) {
  //     handleNavigateDaily();
  //   }
  // }, [castInfo]);

  // const handleNavigateDaily = () => {
  //   const isFirstOpenQuery = query?.get('isFirstOpen');
  //   if (isFirstOpenQuery === 'false') {
  //     AppService.setIsFirstOpen(false);
  //     return;
  //   }

  //   const isFirstOpen = AppService.getIsFirstOpen(pathName!);
  //   if (isFirstOpen) {
  //     AppService.setIsFirstOpen(false);
  //     router.replace('/?isFirstOpen=false');
  //     setTimeout(() => {
  //       router.push('/daily');
  //     }, 100);
  //   }
  // };

  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no App context.</p>;
  }
  const { castInfo } = context.data;

  const router = useRouter();

  useEffect(() => {
    if (castInfo?.dataChecked) {
      handleNavigateDaily();
    }
  }, [castInfo]);

  const handleNavigateDaily = () => {
    setTimeout(() => {
      router.replace('/daily');
    }, 100);
  };

  const query = useSearchParams();
  useEffect(() => {
    const platform = query?.get('platform') ?? '';
    console.log('Platform:', platform);
    localStorage.setItem('platform', platform);
  }, []);

  try {
    (window as any).AppState.postMessage(
      JSON.stringify({
        handler: 'loaded',
      })
    );
  } catch (error) {}

  return <></>;
};

export default App;
