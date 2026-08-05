'use client';

import {
  ConnectivityEventDetail,
  CustomEventName,
} from '@/models/custom_event';
import { daemonConnectivity } from '@/services/DaemonConnectivity';
import { useEffect, useState } from 'react';

const useNetworkManger = () => {
  // Seed from the daemon's last-known verdict instead of a blind `true`. The
  // daemon replays connectivity within milliseconds of CDP connect — often
  // before this hook's listener is attached — and a missed push used to
  // leave an offline cold start reading "online" for the rest of the page
  // lifetime (the field shape behind the blank-wall incident: setup AP up,
  // `navigator.onLine` true, seed never corrected). `null` (no verdict yet)
  // keeps the optimistic seed: standalone browsers have no daemon and must
  // not boot into offline UI.
  const [isOnline, setIsOnline] = useState<boolean>(
    () => daemonConnectivity() ?? true
  );

  useEffect(() => {
    const updateNetworkStatus = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectivityEventDetail>;
      setIsOnline(customEvent.detail.isOnline);
    };

    window.addEventListener(
      CustomEventName.ConnectivityChange,
      updateNetworkStatus
    );
    // Close the seed→listener gap: a push landing between the initial render
    // and this effect is only in the store, not in any event we saw.
    setIsOnline(daemonConnectivity() ?? true);

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
