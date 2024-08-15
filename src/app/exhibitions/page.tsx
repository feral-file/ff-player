import { Suspense } from 'react';
import ExhibitionHall from './exhibitionPlayer';

export default function ExhibitionPage() {
  return (
    <>
      <Suspense>
        <ExhibitionHall />
      </Suspense>
    </>
  );
}
