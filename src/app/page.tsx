import { Suspense, useContext, useEffect } from 'react';
import App from './app';
import { AppContext } from '@/context/AppContext';
import { useSearchParams } from 'next/navigation';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
}

export default function Page() {
  // listen back event

  // listen castInfo

  // handle redirect to daily

  return (
    <>
      <Suspense>
        <App />
      </Suspense>
    </>
  );
}
