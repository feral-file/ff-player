import { useEffect, useState } from 'react';

const networkManger = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    function updateNetworkStatus() {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        window.location.reload();
      }
    }

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
    };
  });

  return isOnline;
};

export default networkManger;
