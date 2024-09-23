'use client';

import { AppContext } from '@/context/AppContext';
import { useContext } from 'react';
import MessageModal from './MessageModal';
import { useTranslations } from 'next-intl';

export default function LostConnectionModal() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const { isOnline } = context;
  const { isDisconnected } = context.websocketData;
  const { screenRatio } = context.deviceRotation ?? { screenRatio: 1 };
  const t = useTranslations('LostConnectionModal');

  return (
    <div>
      {!isOnline && (
        <MessageModal
          screenRatio={screenRatio}
          message={t('internet_connection_lost')}
        />
      )}
      {isOnline && isDisconnected && (
        <MessageModal
          screenRatio={screenRatio}
          message={t('connection_lost')}
        />
      )}
    </div>
  );
}
