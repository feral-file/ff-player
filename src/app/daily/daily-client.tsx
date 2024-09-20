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
import { TIME_PER_HOUR } from '@/constants';
import { CastingArtworkType } from '@/models/metric.model';

export default function DailyClient() {
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

  const [index, setIndex] = useState<number>(0);
  const [title, setTitle] = useState<string>('');
  const series = [
    {
      title: 'Nostalgia (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/ccd387c2-4762-4037-8752-bbc223957199/1726825472/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762981016640&token_id_hash=0x0d9ea64e929000e71e02adcb40bacd55da8acc21f7d804604cfa8b896983edd5',
    },
    {
      title: 'Path of Tones (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/4e5e1cc5-3038-443b-8f5b-f35cab89811d/1721897970/_unique-previews/0',
    },
    {
      title: 'Synergistic Metropolis (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/5f673d60-a2c0-4356-8bf9-09dc0d43f44b/1721897970/_unique-previews/0',
    },
    {
      title: 'Grey Path (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/4fbf3d62-4824-4e2a-9f5c-8051f7c7d566/1724033663/_unique-previews/0',
    },
    {
      title: 'Flows of Pattern (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/dce8e5ee-869d-41f6-8c0b-de98a4a0a98f/1726130590/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762976016640&token_id_hash=0x72b47c1a336bc8b86afa341cf46ec920eec2c8b083d6b4076fa5822d8c3e1ec2',
    },
    {
      title: 'Sea of Code (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/ab6684c6-c8bd-474e-937c-55ca68591085/1724337315/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762977016640&token_id_hash=0x03f0d49d83f15cd8eb7f036a03332a670c9513895c13ee9c893be086f0bc2f3d',
    },
    {
      title: 'Flow Painting (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/4d23d1ce-97c8-411b-b615-e64ca8d78c3c/1724327523/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762978016640&token_id_hash=0x3c49b838cae0f2bd69e5db22e86e966d378c182b60c5bae81145afaea8520d3b',
    },
    {
      title: 'With you (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/3ad37701-9935-438e-8a9c-9dcadab429a6/1724241986/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762979016640&token_id_hash=0xd792353df80b14bd2b47bdc59882a29d96218ec0021f8bfe92efe4a3daa1a3f7',
    },
    {
      title:
        '変化・循環・その間の形 / Changes, Cycles, and Shapes in Between (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/87bf9fc7-cab0-4a60-ac73-6a210ddbbcbc/1724033852/_unique-previews/0',
    },
    {
      title: '響く残響 / Resonant Echo (2024) #1',
      previewURL:
        'https://cdn.feralfileassets.com/previews/a62734e6-bce4-49a6-ab10-1b9698085efa/1725388435/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=1348537551383340122739544414467967762982016640&token_id_hash=0x83012ee9576e78df7c8a3b5db81d78bdd1d40b5a7d486178945e9420e6466d49',
    },
  ];

  useEffect(() => {
    const sr = series[index];
    if (sr.previewURL) {
      setCastPreviewURL(sr.previewURL);
    }
    if (sr.title) {
      setTitle(sr.title);
    }
  }, [index]);

  useEffect(() => {
    const intervalID = setInterval(() => {
      setIndex(prevIndex => {
        if (prevIndex >= series.length - 1) {
          return 0;
        }
        return prevIndex + 1;
      });
    }, 60 * 1000);
    return () => {
      clearInterval(intervalID);
    };
  }, [series.length]);

  useEffect(() => {
    return;

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

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
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
          <p>{title}</p>
        </div>
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          artworkID={artworkID}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
        />
      </div>
    </>
  );
}
