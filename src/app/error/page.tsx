'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageModal from '@/components/MessageModal';
import { LocalStorageItem } from '@/constants';
import { ErrorType } from '@/models/error.model';

const ErrorPage = () => {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('Issue Detected');

  useEffect(() => {
    const errorType = searchParams.get('error');

    switch (errorType) {
      case ErrorType.Overheating: {
        setTitle('System Overheating Detected');
        setMessage(
          'The device temperature has exceeded safe operating levels. To prevent damage, playback will be paused. Please reboot the device to continue viewing the artwork.'
        );
        break;
      }

      default: {
        break;
      }
    }

    return () => {
      if (errorType === ErrorType.Overheating) {
        localStorage.removeItem(LocalStorageItem.criticalTemp);
      }
    };
  }, [searchParams]);

  return (
    <div
      style={{
        backgroundColor: '#000000',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}>
      <MessageModal screenRatio={1} message={message} title={title} />
    </div>
  );
};

export default ErrorPage;
