import { Suspense } from 'react';
import App from './app';

export default function AppPage() {
  return (
    <>
      <Suspense>
        <App />
      </Suspense>
    </>
  );
}
