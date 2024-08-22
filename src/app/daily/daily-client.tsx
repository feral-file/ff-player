'use client';

import Microphone from '@/components/Microphone';
import ArtworkPlayer from '../../components/ArtworkPlayer';
import DailyService, { DailyInstanceService } from '@/services/DailyService';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppContext } from '@/context/AppContext';
import { LocalStorageItem } from '@/constants';

const DailyClient: React.FC = () => {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no app context.</p>;
  }
  const { canvasService } = context.websocketData;
  const dailyService = useRef(new DailyService());
  const timeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const router = useRouter();

  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [isDisplayWebAction, setIsDisplayWebAction] = useState<boolean>(false);

  useEffect(() => {
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
    canvasService.current.disconnect({}).catch((error: unknown) => {
      console.log('Error disconnecting canvas service:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const platform = localStorage.getItem(LocalStorageItem.platform);
    setIsDisplayWebAction(!platform);
  }, [isDisplayWebAction]);

  const handleNavigateAIArtwork = () => {
    router.push('/ai-artwork');
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {castPreviewURL && <ArtworkPlayer previewURL={castPreviewURL} />}
      {isDisplayWebAction && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            cursor: 'pointer',
          }}>
          <Microphone onClick={handleNavigateAIArtwork} />
        </div>
      )}
    </div>
  );
};

export default DailyClient;
