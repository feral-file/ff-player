'use client';

import { useEffect, useState } from 'react';

export interface ConnectivityEventDetail {
  isOnline: boolean;
}

const useNetworkManger = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const updateNetworkStatus = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectivityEventDetail>;
      setIsOnline(customEvent.detail.isOnline);
    };

    window.addEventListener('connectivityChange', updateNetworkStatus);

    return () => {
      window.removeEventListener('connectivityChange', updateNetworkStatus);
    };
  }, []);

  return isOnline;
};

export default useNetworkManger;
