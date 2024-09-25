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
import { AppSettings, TIME_PER_HOUR } from '@/constants';
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

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isLeeMucianExhibition, setIsLeeMucianExhibition] =
    useState<boolean>(false);
  const [currentDailyNumber, setCurrentDailyNumber] = useState<number>(0);
  const [currentDaily, setCurrentDaily] = useState<Daily | undefined>();

  const newDailyHour = context?.appRemoteConfig.new_daily_hour;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (window as any).AppState?.postMessage(
          JSON.stringify({
            handler: 'backAbleChanged',
            data: false,
          })
        );
      } catch (error) {
        console.error(error);
      }
    }

    // Handle cast daily
    async function handleCastDaily() {
      try {
        dailies = await DailyService.callingDailies(0, currentDailyNumber);

        if (dailies.length > 0) {
          // Set metric metadata
          // if (dailyRef.current !== dailies[0]) {
          //   dailyRef.current = dailies[0];
          //   setArtworkID(
          //     convertToTokenID(
          //       dailyRef.current.blockchain,
          //       dailyRef.current.contractAddress,
          //       dailyRef.current.tokenID
          //     )
          //   );
          // }

          if (dailies[0].previewURL) {
            setCurrentDaily(dailies[0]);
            setCastPreviewURL(dailies[0].previewURL);
            setIsLeeMucianExhibition(
              dailies[0].contractAddress === LeeMullican_EXHIBITION_CONTRACT
            );
          }

          startTimeout(30000);
        } else if (currentDailyNumber === 0) {
          startTimeout(5000);
          return;
        } else {
          setCurrentDailyNumber(0);
        }
      } catch (error) {
        console.error(error);
      }
    }

    const startTimeout = (duration: number) => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        setCurrentDailyNumber(prev => prev + 1);
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
  }, [currentDailyNumber]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
        />
        {currentDaily && (
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              right: 0,
              backgroundColor: '#ffffff',
              color: '#000',
              zIndex: 9999,
              padding: '10px',
            }}>
            <p>{currentDaily.displayTime}</p>
          </div>
        )}
      </div>
    </>
  );
}
