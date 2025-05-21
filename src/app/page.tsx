import { Suspense } from 'react';
import App from './app';

export default function AppPage() {
  console.log('[AppPage] Start');

  return (
    <>
      <Suspense>
        <App />
      </Suspense>
    </>
  );
}
