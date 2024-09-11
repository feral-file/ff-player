'use client';

import { Daily } from '@/models';
import ArtworkPlayer from '../../components/artwork-player/ArtworkPlayer';
import DailyService from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { CastingArtworkType } from '@/utils/mixpanel';
import { useEffect, useRef, useState } from 'react';
import Loading from '@/components/loading/loading';
import {
  DEFAULT_DELAY,
  LeeMullican_EXHIBITION_CONTRACT,
} from '@/utils/constants';
import { TIME_PER_HOUR } from '@/constants';

export default function DailyClient() {
  const dailyRef = useRef<Daily>();
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const dailyIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [artworkName, setArtworkName] = useState<string | undefined>();

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isLeeMucianExhibition, setIsLeeMucianExhibition] =
    useState<boolean>(false);

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
        const isRefreshDaily = await DailyService.isRefreshDailies();
        if (isRefreshDaily) {
          dailies = DailyService.getDailies();
        }

        if (dailies.length > 0) {
          // Set mixpanel metadata
          if (dailyRef.current !== dailies[0]) {
            dailyRef.current = dailies[0];
            setArtworkID(dailyRef.current.tokenID);
            setArtworkName(dailyRef.current.tokenName);
          }

          const { delay } = getDelayTime(dailies);
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
      }, TIME_PER_HOUR); // Check refresh daily every hour
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

  if (!castPreviewURL) {
    return <Loading />;
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {castPreviewURL && (
        <ArtworkPlayer
          previewURL={castPreviewURL}
          artworkID={artworkID}
          artworkName={artworkName}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
        />
      )}
    </div>
  );
}
