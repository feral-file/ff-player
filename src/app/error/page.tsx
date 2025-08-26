'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageModal from '@/components/MessageModal';
import { ErrorType } from '@/models/error.model';
import CanvasService from '@/services/CanvasService';
import { CastCommand } from '@/models';

const ErrorPage = () => {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('Issue Detected');

  useEffect(() => {
    const errorType = searchParams.get('error');

    switch (errorType) {
      case ErrorType.Overheating: {
        let playingArtworkTitle: string | undefined;
        const castInfo = CanvasService.getCastInfo();
        if (
          castInfo?.castCommand === CastCommand.castListArtwork &&
          castInfo.items?.length
        ) {
          const playingArtwork = castInfo.items[castInfo.index ?? 0];
          playingArtworkTitle = playingArtwork.title;
        }

        setTitle('System Overheating Detected');
        setMessage(
          `The device temperature has exceeded safe operating levels${playingArtworkTitle ? ` while viewing ${playingArtworkTitle}` : ''}. To prevent damage, playback has been paused. Please reboot the device to continue viewing the artwork.`
        );

        break;
      }

      default: {
        break;
      }
    }
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
