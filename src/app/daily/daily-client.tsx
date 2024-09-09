'use client';

import ArtworkPlayer from '../../components/artwork-player/ArtworkPlayer';
import DailyService, { DailyInstanceService } from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { useEffect, useRef, useState } from 'react';
import Loading from '@/components/loading/loading';
import {
  DEFAULT_DELAY,
  LeeMullican_EXHIBITION_CONTRACT,
} from '@/utils/constants';
import { CastingArtworkType } from '@/services/metric.service';
import { Daily } from '@/models';

export default function DailyClient() {
  const dailyRef = useRef<Daily>();
  const dailyService = useRef(new DailyService());
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [artworkID, setArtworkID] = useState<string | undefined>();

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
        const dailies = await dailyService.current.callingDailies();
        DailyInstanceService.setDailies(dailies);
        if (dailies.length > 0) {
          // Set metric metadata
          if (dailyRef.current !== dailies[0]) {
            dailyRef.current = dailies[0];
            setArtworkID(dailyRef.current.tokenID);
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
  }, []);

  if (!castPreviewURL) {
    return <Loading />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {castPreviewURL && (
        <ArtworkPlayer
          previewURL={castPreviewURL}
          artworkID={artworkID}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
        />
      )}
    </div>
  );
}
