import { Suspense } from 'react';
import DailyClient from './daily-client';

export default function DailyPage() {
  return (
    <Suspense>
      <DailyClient />
    </Suspense>
  );
}
