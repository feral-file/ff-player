'use client';

import { AppContext } from '@/context/AppContext';
import { useContext, useEffect, useState } from 'react';
import MessageModal from './MessageModal';

export default function LostConnectionModal() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }
  const isOnline = context.isOnline;

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
