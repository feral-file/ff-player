'use client';

import { useAppContext } from '@/context/AppContext';
import MessageModal from './MessageModal';
import { useTranslations } from 'next-intl';

export default function LostConnectionModal() {
  const { context } = useAppContext();
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
