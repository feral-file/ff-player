'use client';

import React, { useEffect, useContext } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppContext } from '@/context/AppContext';

const App: React.FC = () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  // useEffect(() => {
  //   if (castInfo) {
  //     const handleCastCommand = async () => {
  //       console.log('--------------');
  //       console.log('Cast Command:', JSON.stringify(castInfo));
  //       console.log('--------------');

  //       switch (castInfo.castCommand) {
  //         case CastCommand.castListArtwork: {
  //           setDisplayComingSoon(false); // Temporary display coming soon
  //           setDisplayOnboarding(false);
  //           indexRef.current = -1;
  //           const getNftTokens = async (ids: string[]) => {
  //             if (!ids.length) {
  //               return;
  //             }
  //             try {
  //               const tokens = await artworkService.current.queryTokens(ids);
  //               const artworks = castInfo.artworks;
  //               if (!artworks) {
  //                 return;
  //               }

  //               const previewData = new Map<string, string>();
  //               tokens.forEach((token: IndexerToken) => {
  //                 previewData.set(
  //                   token.indexID,
  //                   token.asset.metadata.project.latest.previewURL
  //                 );
  //               });
  //               const updatedArtworks = artworks.map(
  //                 (artwork: PlayArtworkV2) => {
  //                   const aw: PlaylistToken = {
  //                     duration: artwork.duration,
  //                     previewURL:
  //                       previewData.get(artwork.token?.id ?? '') ?? '',
  //                     token: artwork.token ?? { id: '' },
  //                   };

  //                   return aw;
  //                 }
  //               );
  //               setPlaylist(updatedArtworks);
  //               if (castInfo.startTime) {
  //                 setStartTime(castInfo.startTime);
  //                 const i = getIndex(updatedArtworks, castInfo.startTime);
  //                 setCurrentIndex(i);
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
  //               (artwork: PlayArtworkV2) => artwork.token?.id ?? ''
  //             );
  //             getNftTokens(assetIds).catch((error: unknown) => {
  //               console.error(error);
  //             });
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
  //           break;
  //         }

  //         case CastCommand.connect: {
  //           if (
  //             !(await DeviceManager.isPreviouslyConnectedDevice(
  //               castInfo.deviceInfo?.deviceId ?? ''
  //             ))
  //           ) {
  //             setDisplayOnboarding(true);
  //             await DeviceManager.addPreviouslyConnectedDeviceId(
  //               castInfo.deviceInfo?.deviceId ?? ''
  //             );
  //           }
  //           break;
  //         }

  //         case CastCommand.castDaily: {
  //           await handleCastDaily();
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
  //           handleMoveToArtwork(castInfo.value as string);
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
  //           setViewMode(
  //             viewMode === ViewMode.landscape
  //               ? ViewMode.portrait
  //               : ViewMode.landscape
  //           );
  //           setRotateRadius(rotateRadius + 90);

  //           break;
  //         }
  //       }
  //     };
  //     handleCastCommand().catch((error: unknown) => {
  //       console.error(error);
  //     });
  //   } else {
  //     refreshData();
  //   }
  // }, [castInfo]);

  const searchParams = useSearchParams();
  const router = useRouter();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const platform = searchParams?.get('platform') ?? '';
    localStorage.setItem('platform', platform);

    setTimeout(() => {
      router.replace('/daily');
    }, 100);
  }, []);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    if (typeof window !== 'undefined') {
      const appState = (window as any).AppState;
      if (appState) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        appState.postMessage(
          JSON.stringify({
            handler: 'loaded',
          })
        );
      }
    }
  } catch (error) {
    console.error(error);
  }

  return <></>;
};

export default App;
