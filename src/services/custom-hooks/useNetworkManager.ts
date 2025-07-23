'use client';

import {
  ConnectivityEventDetail,
  CustomEventName,
} from '@/models/custom_event';
import { useEffect, useState } from 'react';

const useNetworkManger = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const updateNetworkStatus = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectivityEventDetail>;
      setIsOnline(customEvent.detail.isOnline);
    };

    window.addEventListener(
      CustomEventName.ConnectivityChange,
      updateNetworkStatus
    );

    return () => {
      window.removeEventListener(
        CustomEventName.ConnectivityChange,
        updateNetworkStatus
      );
    };
  }, []);

  return isOnline;
};

export default useNetworkManger;
