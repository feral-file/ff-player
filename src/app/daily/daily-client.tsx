'use client';

import ArtworkPlayer from '@/components/artworkPlayer';
import ArtworkService from '@/services/ArtworkService';
import DailyService from '@/services/DailyService';
import { Daily } from '@/utils/types';
import { useEffect, useRef, useState } from 'react';

export default function DailyClient() {
  const artworkService = useRef(new ArtworkService());
  const dailyService = useRef(new DailyService());
  const effectRan = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [dailies, setDailies] = useState<Daily[]>([]);

  useEffect(() => {
    if (effectRan.current) {
      return;
    }

    effectRan.current = true;
    handleCastDaily();
  }, []);

  const getTokenID = (d: Daily) => {
    switch (d.blockchain) {
      case 'ethereum': {
        return `eth-${d.contractAddress}-${d.tokenID}`;
      }

      case 'bitmark': {
        return `bmk--${d.tokenID}`;
      }

      case 'tezos': {
        return `tez-${d.contractAddress}-${d.tokenID}`;
      }

      default: {
        return '';
      }
    }
  };

  const getDailies = async () => {
    try {
      const dailies = await dailyService.current.getUpcomingDaily();
      setDailies(dailies);
      return dailies;
    } catch (error) {
      return dailies;
    }
  };

  // Handle cast daily
  const handleCastDaily = async () => {
    const daily = await getDailies();
    if (!daily) {
      return;
    }
    const ids = daily.map((d: Daily) => {
      return getTokenID(d);
    });

    if (ids.length === 0) {
      return;
    }

    const data = await artworkService.current.queryTokens(ids);
    const previewData: Map<string, string> = new Map();
    data.tokens.forEach((token: any) => {
      previewData.set(token.id, token.asset.metadata.project.latest.previewURL);
    });

    const dailies = daily.map((d: Daily) => {
      return {
        ...d,
        previewURL: previewData.get(d.tokenID),
      };
    });

    if (dailies.length > 0) {
      const now = Date.now();
      const currentDisplayTime = new Date(dailies[0].displayTime);
      let nextDisplayTime = currentDisplayTime.setDate(
        currentDisplayTime.getDate() + 1
      );
      if (dailies.length > 1 && dailies[1].displayTime) {
        nextDisplayTime = new Date(dailies[1].displayTime).getTime();
      }

      const delay = nextDisplayTime - now;
      if (dailies[0].previewURL) {
        setCastPreviewURL(dailies[0].previewURL);
      }

      startInterval(delay);
    }
  };

  const startInterval = (duration: number) => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      handleCastDaily();
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
      <ArtworkPlayer previewURL={castPreviewURL!} />
    </div>
  );
}
