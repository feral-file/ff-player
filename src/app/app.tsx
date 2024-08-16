'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const App: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const platform = searchParams.get('platform') ?? '';
    localStorage.setItem('platform', platform);

    setTimeout(() => {
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

      router.replace('/ai-artwork');
    }, 100);
  }, [router, searchParams]);

  return <></>;
};

export default App;
