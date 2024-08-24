'use client';

import { AppContext } from '@/context/AppContext';
import { useContext } from 'react';
import MessageModal from './MessageModal';

export default function LostConnectionModal() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const isOnline = context.isOnline;
  const screenRatio = context.deviceRotation?.screenRatio ?? 1;

  return (
    <div>
      {!isOnline && (
        <MessageModal
          screenRatio={screenRatio}
          message="Internet connection lost. Reconnecting..."
        />
      )}
    </div>
  );
}
