'use client';

import { AppContext } from '@/context/AppContext';
import { useContext } from 'react';
import MessageModal from './MessageModal';

export default function LostConnectionModal() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }
  const isOnline = context.isOnline && !context.websocketData.isDisconnected;

  return (
    <div>
      {!isOnline && (
        <MessageModal
          screenRatio={1}
          message="Internet connection lost. Reconnecting..."
        />
      )}
    </div>
  );
}
