'use client';

import { useAppContext } from '@/context/AppContext';
import MessageModal from './MessageModal';

export default function LostConnectionModal() {
  const { context } = useAppContext();
  const { isOnline } = context;
  const { screenRatio } = context.deviceRotation ?? { screenRatio: 1 };

  return (
    <div>
      {!isOnline && (
        <MessageModal
          screenRatio={screenRatio}
          title={'Internet connection lost. Reconnecting...'}
        />
      )}
    </div>
  );
}
