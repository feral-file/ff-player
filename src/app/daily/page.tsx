import { Suspense } from 'react';
import DailyClient from './daily-client';

export default function Daily() {
  return (
    <Suspense>
      <DailyClient />
    </Suspense>
  );
}
