'use client';

import ArtworkPlayer from '../../components/artwork-player/ArtworkPlayer';
import DailyService from '@/services/DailyService';
import { useEffect, useRef, useState } from 'react';
import { Daily, ViewMode } from '@/models';
import {
  DEFAULT_DAILY,
  DEFAULT_DELAY,
  LEE_MULLICAN_EXHIBITION_CONTRACT,
  SWITCH_TOKEN_INTERVAL,
  TIMESTAMP_PER_HOUR,
} from '@/constants';
import { CastingArtworkType } from '@/models/metric.model';
import { useAppContext } from '@/context/AppContext';
import * as Sentry from '@sentry/nextjs';
import { defaultDP1DisplayPreference, DP1Call } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { IndexerService } from '@/services/IndexerService';
import { buildPlaylistItem, normalizeProvenanceChain } from '@/utils/helper';

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
  const currentTokenIndex = useRef<number>(0);
  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [artworkPreviewMIMEType, setArtworkPreviewMIMEType] = useState<
    string | undefined
  >();

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isLeeMullicanExhibition, setIsLeeMullicanExhibition] =
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
    if (dailyRef.current?.previewURL) {
      setCastPreviewURL(DEFAULT_DAILY.previewURL);
      setArtworkPreviewMIMEType('image');
    }

    saveCurrentDailyInfo(DEFAULT_DAILY.indexerTokenID, true);
  };

  useEffect(() => {
    // Handle cast daily
    async function handleCastDaily() {
      try {
        await DailyService.refreshDailies(newDailyHour);
        const firstDaily = DailyService.getDaily();
        if (!firstDaily) {
          return;
        }

        if (firstDaily.id !== dailyRef.current?.id) {
          dailyRef.current = firstDaily;
          setArtworkPreviewMIMEType(dailyRef.current.artwork?.previewMIMEType);
          setIsLeeMullicanExhibition(
            dailyRef.current.contractAddress ===
              LEE_MULLICAN_EXHIBITION_CONTRACT
          );

          // Reset next token handle
          currentTokenIndex.current = 0;
          if (switchTokenRef.current) {
            clearInterval(switchTokenRef.current);
          }

          if (dailyRef.current.tokenIDs.length > 1) {
            // Slideshow
            const tokenIDs = dailyRef.current.tokenIDs;
            const updateDailyInfo = (index: number) => {
              const currentTokenID = tokenIDs[index];
              const indexerTokenID = dailyRef.current?.indexerTokenID?.replace(
                /-[^-]+$/,
                `-${currentTokenID}`
              );
              setArtworkID(indexerTokenID);

              if (!indexerTokenID) {
                fallbackToDefaultArtwork();
                return;
              }

              IndexerService.queryIndexerToken(indexerTokenID)
                .then(token => {
                  if (!token) {
                    fallbackToDefaultArtwork();
                    return;
                  }

                  const previewUrls = DailyService.getPreviewURLs(token);
                  if (!previewUrls) {
                    fallbackToDefaultArtwork();
                    return;
                  }

                  setLandscapeStaticURL(previewUrls[0]);
                  setPortraitStaticURL(previewUrls[1]);
                  saveCurrentDailyInfo(indexerTokenID);
                })
                .catch((error: unknown) => {
                  console.error(error, ':', JSON.stringify(error));
                  Sentry.captureException(error);
                  fallbackToDefaultArtwork();
                });
            };

            // Trigger the function immediately
            updateDailyInfo(0);

            // Set up the interval
            switchTokenRef.current = setInterval(() => {
              currentTokenIndex.current =
                (currentTokenIndex.current + 1) % tokenIDs.length;
              updateDailyInfo(currentTokenIndex.current);
            }, SWITCH_TOKEN_INTERVAL);
          } else {
            setArtworkID(dailyRef.current.indexerTokenID);
            setCastPreviewURL(dailyRef.current.previewURL ?? '');
            saveCurrentDailyInfo(dailyRef.current.indexerTokenID ?? '');
          }
        }

        const delay = DailyService.getNextDailyDelay(newDailyHour);
        startTimeout(delay > 0 ? delay : DEFAULT_DELAY);
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

    const clearDailyInterval = () => {
      if (dailyIntervalRef.current) {
        clearInterval(dailyIntervalRef.current);
      }
    };

    return () => {
      clearDailyInterval();
    };
  }, []);

  function saveCurrentDailyInfo(
    indexerTokenID: string,
    isDefaultDaily = false
  ) {
    const blockchain = dailyRef.current?.blockchain ?? '';
    const contractAddress = dailyRef.current?.contractAddress ?? '';
    const items = dailyRef.current?.tokenIDs.map(tokenID => {
      return buildPlaylistItem(
        normalizeProvenanceChain(
          isDefaultDaily ? DEFAULT_DAILY.blockchain : blockchain
        ),
        isDefaultDaily ? DEFAULT_DAILY.contractAddress : contractAddress,
        isDefaultDaily ? DEFAULT_DAILY.tokenID : tokenID,
        dailyRef.current?.tokenIDs.length === 1 ? 0 : SWITCH_TOKEN_INTERVAL
      );
    });

    const playlist: DP1Call = {
      dpVersion: '1.0',
      title: 'Daily',
      items,
      signature: '',
    };

    const index =
      dailyRef.current?.tokenIDs.length === 1 ? 0 : currentTokenIndex.current;
    canvasService.setCastInfo(
      {
        ...canvasService.getCastInfo(),
        dailyTokenID: indexerTokenID,
        playlist,
        index,
      },
      false
    );
  }

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID ?? ''}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMullicanExhibition}
          artworkPreviewMIMEType={artworkPreviewMIMEType}
          displayPreferences={defaultDP1DisplayPreference}
        />
      </div>
    </>
  );
}
