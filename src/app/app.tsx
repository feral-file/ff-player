'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { initMixpanel } from '@/utils/mixpanel';

const App: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize mixpanel
  useEffect(() => {
    const platform = searchParams.get('platform') ?? '';
    if (platform) {
      localStorage.setItem('platform', platform);
    }
    initMixpanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const appState = (window as any).AppState;
        if (appState) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          appState.postMessage(
            JSON.stringify({
              handler: 'loaded',
            })
          );
        }
      }
    } catch (error) {
      console.error(error);
    }

    router.replace('/daily');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <></>;
};

export default App;
