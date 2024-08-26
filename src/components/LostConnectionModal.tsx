'use client';

import { AppContext } from '@/context/AppContext';
import { useContext, useEffect, useState } from 'react';
import MessageModal from './MessageModal';

export default function LostConnectionModal() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const { isDisconnected } = context.websocketData;
  const { screenRatio } = context.deviceRotation ?? { screenRatio: 1 };

  useEffect(() => {
    if (!isOnline && context.isOnline) {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
    setIsOnline(context.isOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.isOnline]);

  return (
    <div>
      {!isOnline && (
        <MessageModal
          screenRatio={screenRatio}
          message="Internet connection lost. Reconnecting..."
        />
      )}
      {isOnline && isDisconnected && (
        <MessageModal
          screenRatio={screenRatio}
          message="Connection lost. Trouble communicating with the server. Please wait while attempting to reconnect."
        />
      )}
    </div>
  );
}
