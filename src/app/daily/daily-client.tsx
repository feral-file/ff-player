'use client';

import ArtworkPlayer from '../../components/ArtworkPlayer';
import DailyService, { DailyInstanceService } from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { useEffect, useRef, useState } from 'react';

export default function DailyClient() {
  const dailyService = useRef(new DailyService());
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);

  useEffect(() => {
    handleCastDaily().catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  // Handle cast daily
  async function handleCastDaily() {
    try {
      const dailies = await dailyService.current.callingDailies();
      DailyInstanceService.setDailies(dailies);
      if (dailies.length > 0) {
        const delay = getDelayTime(dailies);
        if (dailies[0].previewURL) {
          setCastPreviewURL(dailies[0].previewURL);
        }

        startInterval(delay);
      }
    } catch (error) {
      console.error(error);
    }
  }

  const startInterval = (duration: number) => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      handleCastDaily().catch((error: unknown) => {
        console.error(error);
      });
    }, duration);
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {castPreviewURL && <ArtworkPlayer previewURL={castPreviewURL} />}
    </div>
  );
}
