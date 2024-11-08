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
import { usePopUpContext } from '@/context/PopUpContext';

export default function DailyClient() {
  const { context } = useAppContext();
  const newDailyHour = context.appRemoteConfig.new_daily_hour;
  const { setDisplayInfo } = usePopUpContext();
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
      title: 'E-volved Formula #01 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/9d8ba8bc-1e6e-4dbe-acbe-9c2cbf8d793a/1730719785/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=169257126700020007732020491772509161426731584&token_id_hash=0x674cdeb0584e427abd1d32e42d065d4cfa48ca2fbf34dc3425e654ced021916d',
    },
    {
      title: 'E-volved Formula #02 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/a2ec59c2-a56e-488c-9fdf-a67e04117337/1730719812/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582813705344&token_id_hash=0xfe9fabfb8d368129e51bceb93e0045f4788cd4813b15568bda24fb63257d2f67',
    },
    {
      title: 'E-volved Formula #03 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/04f89cc6-7042-4eed-9566-b46d78621ef3/1730719838/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582814705344&token_id_hash=0x02200e76b983dad7b220d993fa4144b198f6cbd4e37fa353e26ffdfa2d6870d2',
    },
    {
      title: 'E-volved Formula #04 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/dfb66bb8-1f6e-45f6-b18d-8b9c070f345f/1730719857/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582815705344&token_id_hash=0xa2d03e5303ad9c7810672a22674acb93d4ceb67062340556564b27009b588447',
    },
    {
      title: 'E-volved Formula #05 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/7a6b063b-638e-4b39-9116-21a9f77f52a2/1730719876/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582816705344&token_id_hash=0x9a0e251f651ea08c721461f39f2b73f8d4131f228723844d9930fb9998c6a31d',
    },
    {
      title: 'E-volved Formula #06 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/f247bc81-b318-4682-9678-0107a53dd6ec/1730719896/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582817705344&token_id_hash=0x477a3dc83e687671a818115c6bb8e1670ced6dd2351becf87471676fa11290a8',
    },
    {
      title: 'E-volved Formula #07 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/00afe566-666c-4503-bdc1-b3d50b75e7a3/1730719917/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582818705344&token_id_hash=0xb68e32253c2c20525030000fb4c211636d1f617340905eb72e4f1f839b7d6319',
    },
    {
      title: 'E-volved Formula #08 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/5f9b3499-a222-4db8-9819-93476cddad3b/1730719946/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582819705344&token_id_hash=0x229ab258b2b3af897847f20cd6d57cf4b0e1a2bcb7d5e92d1ed896c3af7359b3',
    },
    {
      title: 'E-volved Formula #09 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/6bf16a3e-74ce-4cb8-88dd-5d759649fbc5/1730719964/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582820705344&token_id_hash=0x2481e67c87e614fa321ebe6ad21f2ac8ce6f1d9ddc034c7d6048f443ef2816b6',
    },
    {
      title: 'E-volved Formula #10 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/6bbf0654-f674-4fda-a1c0-48f2fa0a0784/1730719984/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582821705344&token_id_hash=0x9a09304dda1ffaa5e7692244e201b3751ff978e40acdac23d1afc6a496612441',
    },
    {
      title: 'E-volved Formula #11 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/03c214ff-a9f1-4731-a6a4-79335f9fe6d7/1730720027/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582822705344&token_id_hash=0xda54d3960906e4fee92d456aa767f738ca611df7070e0ee153e820197501e4e5',
    },
    {
      title: 'E-volved Formula #12 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/dbec51af-3c01-4824-bd91-a21a3b23eaed/1730720051/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582823705344&token_id_hash=0x4bb312b801dc51fb09656f844f793a36b6acaac57d02f9655f02775da7ff44ac',
    },
    {
      title: 'E-volved Formula #13 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/1b605863-0e96-4380-b90f-e5211f96c071/1730720069/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582824705344&token_id_hash=0x7d9180c0e6077fa84e1a6635f14975d946956be02cb9ce80940ab26c8a09bfda',
    },
    {
      title: 'E-volved Formula #14 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/58b77db4-51c0-4199-a36f-9fdbaa802477/1730720090/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582825705344&token_id_hash=0x2c2808fcdaf0871001a3d2c555f9634d1bda9c1db26854260c411cd890128df9',
    },
    {
      title: 'E-volved Formula #15 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/8ea87e8d-51c1-411a-b3d6-cf1c86e14747/1730720112/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582826705344&token_id_hash=0x5579e205bad41f3dd517e33ea6ff22a47050cf8430f7173de39ea728e26465fb',
    },
    {
      title: 'E-volved Formula #16 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/d0f8e49a-ff14-4dd3-8e9f-610511318b8d/1730720132/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=2708114027200320123712327868360146582827705344&token_id_hash=0xc231d4d003aec048fc85acc62782c3ffd3e8d9b8369a6e51bdce105eb08a5087',
    },
    {
      title: 'E-volved Formula #17 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/db81d1a6-f70e-4665-862a-000417c28877/1730720150/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325004285504&token_id_hash=0x2999d17ffdf055f50543b77b348a1935e45464fe7fa8a6e6cfdff4b481c9ce05',
    },
    {
      title: 'E-volved Formula #18 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/3645c044-192b-41a8-a094-2d77213afadf/1730720172/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325005285504&token_id_hash=0x0a09550ebfba02e17a06cbda2fdca8948744371f527b36db7915f9c34d8987d0',
    },
    {
      title: 'E-volved Formula #19 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/e8e9f20b-1c6e-4528-b768-aa1a32deb31b/1730720190/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325006285504&token_id_hash=0xecba3b1865b412f3d3eedd91213fbce71cb9dcdfcc2c301e77311977be38b839',
    },
    {
      title: 'E-volved Formula #20 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/e1964643-d46f-4c3c-aaf1-b77ae595b6f9/1730720207/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325007285504&token_id_hash=0x7ad1a0b687cb8179196f1b423e898d37ec0deb49d9fd25ebfd31c05f5b99509a',
    },
    {
      title: 'E-volved Formula #21 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/3273f7b9-102c-4e87-96af-a8fab3db7158/1730720226/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325008285504&token_id_hash=0x115bd7f2ebe5730eea7889080a6a22c7cd386e017a085672b0c79acdcc6de253',
    },
    {
      title: 'E-volved Formula #22 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/10b93289-a501-4b34-b0a5-514f70a83a1b/1730720243/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325009285504&token_id_hash=0xfbdd1c69a9eea0172bcd8a0aec7b3c9e124c6d2256cd76721b14d4351682e468',
    },
    {
      title: 'E-volved Formula #23 (2024)',
      previewURL:
        'https://cdn.feralfileassets.com/previews/8cf47dfe-e6d2-4e3e-9413-904d8b2a4a94/1730720262/index.html?edition_number=0&artwork_number=1&blockchain=ethereum&token_id=43329824435205121979397245893762345325010285504&token_id_hash=0xee74594f609903a5b3543e75ecd05cd9915cdeeafa96adf4e6a27f0f6703f77f',
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
  });

  useEffect(() => {
    // Handle cast daily
    async function handleCastDaily() {
      try {
        const isRefreshDaily =
          await DailyService.isRefreshDailies(newDailyHour);
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

            // Set display info into PopUpContext
            setDisplayInfo({
              token: dailyRef.current.token,
              ffArtworkID: dailyRef.current.artwork?.id, // Assume that daily should be FF artwork
              dailyNote: dailyRef.current.note,
            });
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
          artworkID={artworkID ?? ''}
          castingType={CastingArtworkType.Daily}
          isCustomView={isLeeMucianExhibition}
        />
      </div>
    </>
  );
}
