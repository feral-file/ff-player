'use client';

import ArtworkPlayer from '../../components/artwork-player/ArtworkPlayer';
import DailyService from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DELAY,
  LeeMullican_EXHIBITION_CONTRACT,
} from '@/utils/constants';
import { Daily } from '@/models';
import { convertToTokenID } from '@/utils/indexer';
import { TIMESTAMP_PER_HOUR } from '@/constants';
import { CastingArtworkType } from '@/models/metric.model';
import { useAppContext } from '@/context/AppContext';

export default function DailyClient() {
  const { context } = useAppContext();
  const dailyRef = useRef<Daily>();
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const dailyIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [artworkPreviewMIMEType, setArtworkPreviewMIMEType] = useState<
    string | undefined
  >();

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isLeeMucianExhibition, setIsLeeMucianExhibition] =
    useState<boolean>(false);

  const newDailyHour = context.appRemoteConfig.new_daily_hour;

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

          const { delay } = getDelayTime(newDailyHour);
          if (dailies[0].previewURL) {
            setCastPreviewURL(dailies[0].previewURL);
            setIsLeeMucianExhibition(
              dailies[0].contractAddress === LeeMullican_EXHIBITION_CONTRACT
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

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID ?? ''}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
          artworkPreviewMIMEType={artworkPreviewMIMEType}
        />
      </div>
    </>
  );
}
