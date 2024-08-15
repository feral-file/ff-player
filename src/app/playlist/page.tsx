import { Suspense } from 'react';
import PlaylistClient from './playlist-client';

export default function PlaylistPage() {
  return (
    <>
      <Suspense>
        <PlaylistClient />
      </Suspense>
    </>
  );
}
