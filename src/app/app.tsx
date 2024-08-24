'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const App: React.FC = () => {
  const router = useRouter();

  const searchParams = useSearchParams();

  useEffect(() => {
    const platform = searchParams.get('platform') ?? '';
    if (platform) {
      localStorage.setItem('platform', platform);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    router.replace('/daily');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <></>;
};

export default App;
