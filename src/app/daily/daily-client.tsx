'use client';

import ArtworkPlayer from '../../components/artwork-player/ArtworkPlayer';
import DailyService from '@/services/DailyService';
import { useEffect, useRef, useState } from 'react';
import { Daily, ViewMode } from '@/models';
import { convertToTokenID } from '@/utils/indexer';
import {
  DEFAULT_DELAY,
  LEE_MULLICAN_EXHIBITION_CONTRACT,
  SWITCH_TOKEN_INTERVAL,
  TIMESTAMP_PER_HOUR,
} from '@/constants';
import { CastingArtworkType } from '@/models/metric.model';
import { useAppContext } from '@/context/AppContext';
import * as Sentry from '@sentry/nextjs';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';

export default function DailyClient() {
  const { context } = useAppContext();
  const [landscapeStaticURL, setLandscapeStaticURL] = useState<string | null>();
  const [portraitStaticURL, setPortraitStaticURL] = useState<string | null>();
  const dailyRef = useRef<Daily>();
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const dailyIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const switchTokenRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const nextTokenIndex = useRef<number>(0);
  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [artworkPreviewMIMEType, setArtworkPreviewMIMEType] = useState<
    string | undefined
  >();

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isLeeMucianExhibition, setIsLeeMucianExhibition] =
    useState<boolean>(false);

  const newDailyHour = context.appRemoteConfig.new_daily_hour;

  useEffect(() => {
    const landScape = context.deviceRotation?.viewMode === ViewMode.landscape;
    if (landscapeStaticURL && landScape) {
      setCastPreviewURL(landscapeStaticURL);
      setArtworkPreviewMIMEType('image');
      return;
    }

    if (portraitStaticURL && !landScape) {
      setCastPreviewURL(portraitStaticURL);
      setArtworkPreviewMIMEType('image');
    }
  }, [landscapeStaticURL, portraitStaticURL, context.deviceRotation?.viewMode]);

  const fallbackToDefaultArtwork = () => {
    if (switchTokenRef.current) {
      clearInterval(switchTokenRef.current);
    }

    if (dailyRef.current?.previewURL) {
      setCastPreviewURL(dailyRef.current.previewURL);
      setArtworkPreviewMIMEType(dailyRef.current.artwork?.previewMIMEType);
    }

    console.log('setDailyTokenID to undefined');

    canvasService.setCastInfo(
      {
        ...canvasService.getCastInfo(),
        dailyTokenID: undefined,
      },
      false
    );
  };

  useEffect(() => {
    // Handle cast daily
    async function handleCastDaily() {
      try {
        await DailyService.refreshDailies(newDailyHour);
        dailies = DailyService.getDailies();
        if (dailies.length > 0) {
          // Set metric metadata
          if (dailyRef.current !== dailies[0]) {
            dailyRef.current = dailies[0];
            setArtworkID(
              convertToTokenID(
                dailyRef.current.blockchain,
                dailyRef.current.contractAddress,
                dailyRef.current.tokenID
              )
            );
            setArtworkPreviewMIMEType(
              dailyRef.current.artwork?.previewMIMEType
            );
          }

          const delay = DailyService.getNextDailyDelay(newDailyHour);
          // Reset next token handle
          nextTokenIndex.current = 0;
          if (switchTokenRef.current) {
            clearInterval(switchTokenRef.current);
          }

          if (dailyRef.current.tokenIDs.length > 1) {
            const tokenIDs = dailyRef.current.tokenIDs;
            const currentTokenID = tokenIDs[nextTokenIndex.current];
            const updatePreview = () => {
              DailyService.getPreviewURLs(currentTokenID, dailies[0])
                .then(urls => {
                  if (!urls) {
                    fallbackToDefaultArtwork();
                    return;
                  }

                  setLandscapeStaticURL(urls[0]);
                  setPortraitStaticURL(urls[1]);

                  convertAndSaveDailyTokenId(currentTokenID, dailies[0]);
                })
                .catch((error: unknown) => {
                  console.error(error, ':', JSON.stringify(error));
                  Sentry.captureException(error);
                  fallbackToDefaultArtwork();
                });
              const numberOfToken = tokenIDs.length;
              nextTokenIndex.current =
                (nextTokenIndex.current + 1) % numberOfToken;
            };

            // Trigger the function immediately
            updatePreview();

            // Set up the interval
            switchTokenRef.current = setInterval(
              updatePreview,
              SWITCH_TOKEN_INTERVAL
            );
          } else if (dailyRef.current.previewURL) {
            setCastPreviewURL(dailyRef.current.previewURL);
            setIsLeeMucianExhibition(
              dailies[0].contractAddress === LEE_MULLICAN_EXHIBITION_CONTRACT
            );

            convertAndSaveDailyTokenId(
              dailyRef.current.tokenID,
              dailyRef.current
            );
          }

          startTimeout(delay > 0 ? delay : DEFAULT_DELAY);
        }
      } catch (error) {
        console.error(error);
      }

      dailyIntervalRef.current = setInterval(() => {
        clearDailyInterval();
        handleCastDaily().catch((error: unknown) => {
          console.error(error);
        });
      }, TIMESTAMP_PER_HOUR); // Check refresh daily every hour
    }

    const startTimeout = (duration: number) => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        // Cast next daily
        handleCastDaily().catch((error: unknown) => {
          console.error(error);
        });
      }, duration);
    };

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };

    handleCastDaily().catch((error: unknown) => {
      console.error(error);
    });

    let dailies: Daily[] = [];
    const clearDailyInterval = () => {
      if (dailyIntervalRef.current) {
        clearInterval(dailyIntervalRef.current);
      }
    };

    return () => {
      clearDailyInterval();
    };
  }, []);

  function convertAndSaveDailyTokenId(tokenID: string, daily: Daily) {
    DailyService.getDailyIndexerTokenID(tokenID, daily)
      .then(dailyTokenID => {
        console.log('setDailyTokenID', dailyTokenID);
        canvasService.setCastInfo(
          {
            ...canvasService.getCastInfo(),
            dailyTokenID: dailyTokenID,
          },
          false
        );
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID ?? ''}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
          artworkPreviewMIMEType={artworkPreviewMIMEType}
          displayPreferences={defaultDP1DisplayPreference}
        />
      </div>
    </>
  );
}
