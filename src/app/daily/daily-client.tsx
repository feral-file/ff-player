'use client';

import ArtworkPlayer from '@/components/ArtworkPlayer';
import { IndexerToken } from '@/models';
import ArtworkService from '@/services/ArtworkService';
import DailyService from '@/services/DailyService';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { getIndexerTokenName } from '@/utils/indexer';
import {
  MixpanelEventName,
  trackDailyEvent,
  trackTimeEvent,
} from '@/utils/mixpanel';
import { Daily } from '@/utils/types';
import { useEffect, useRef, useState } from 'react';

export default function DailyClient() {
  const artworkService = useRef(new ArtworkService());
  const dailyService = useRef(new DailyService());
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const effectRan = useRef(false);

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [dailies, setDailies] = useState<Daily[]>([]);
  const dailiesRef = useRef<Daily[]>(dailies);

  useEffect(() => {
    const handleKeyDown = () => {
      history.back();
    };

    EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    EventEmitter.subscribe(Event.keyDown, handleKeyDown);

    // Cleanup the event listener on component unmount
    return () => {
      _trackDailyEvent(true);
      EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (effectRan.current) {
      return;
    }

    effectRan.current = true;
    handleCastDaily().catch((error: unknown) => {
      console.error(error);
    });
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
      console.error(error);
      return dailies;
    }
  };

  // Handle cast daily
  const handleCastDaily = async () => {
    try {
      const daily = await getDailies();
      const ids = daily.map((d: Daily) => {
        return getTokenID(d);
      });

      if (ids.length === 0) {
        return;
      }

      const data = await artworkService.current.queryTokens(ids);
      const previewData = new Map<string, string>();
      data.forEach((token: IndexerToken) => {
        previewData.set(
          token.id,
          token.asset.metadata.project.latest.previewURL
        );
      });

      const dailies = daily.map((d: Daily) => {
        let tokenName = '';
        const token = data.find(
          (token: IndexerToken) => d.tokenID === token.id
        );
        if (token) {
          tokenName = getIndexerTokenName(token);
        }
        return {
          ...d,
          previewURL: previewData.get(d.tokenID),
          tokenName,
        };
      });

      if (dailies.length > 0) {
        dailiesRef.current = dailies;
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
          trackTimeEvent(MixpanelEventName.CastArtworkEventName);
          setCastPreviewURL(dailies[0].previewURL);
        }

        startInterval(delay);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const startInterval = (duration: number) => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      handleCastDaily().catch((error: unknown) => {
        console.error(error);
      });
      _trackDailyEvent();
    }, duration);
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  };

  const _trackDailyEvent = (isSendBeacon?: boolean) => {
    if (dailiesRef.current.length > 0) {
      trackDailyEvent(
        dailiesRef.current[0].tokenID,
        dailiesRef.current[0].tokenName,
        isSendBeacon
      );
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {castPreviewURL && <ArtworkPlayer previewURL={castPreviewURL} />}
    </div>
  );
}
