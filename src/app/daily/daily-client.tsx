'use client';

import ArtworkPlayer from '../../components/ArtworkPlayer';
import DailyService, { DailyInstanceService } from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import {
  MixpanelEventName,
  trackDailyEvent,
  trackTimeEvent,
} from '@/utils/mixpanel';
import { Daily } from '@/utils/types';
import { useEffect, useRef, useState } from 'react';

export default function DailyClient() {
  const dailyRef = useRef<Daily>();
  const dailyService = useRef(new DailyService());
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);

  useEffect(() => {
    // Handle cast daily
    async function handleCastDaily() {
      try {
        const dailies = await dailyService.current.callingDailies();
        DailyInstanceService.setDailies(dailies);
        if (dailies.length > 0) {
          dailyRef.current = dailies[0];
          const delay = getDelayTime(dailies);
          if (dailies[0].previewURL) {
            trackTimeEvent(MixpanelEventName.CastArtworkEventName);
            setCastPreviewURL(dailies[0].previewURL);
          }

          if (delay > 0) {
            startTimeout(delay);
          }
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

        // Track daily event
        if (dailyRef.current) {
          trackDailyEvent(dailyRef.current.tokenID, dailyRef.current.tokenName);
        }
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

    return () => {
      // Track daily event when unmount
      if (dailyRef.current) {
        trackDailyEvent(
          dailyRef.current.tokenID,
          dailyRef.current.tokenName,
          true
        );
      }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {castPreviewURL && <ArtworkPlayer previewURL={castPreviewURL} />}
    </div>
  );
}
