'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageModal from '@/components/MessageModal';
import { ErrorType } from '@/models/error.model';
import { canvasService } from '@/services/CanvasService';
import { CastCommand } from '@/models';

const ErrorPage = () => {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('Issue Detected');

  function getPlayingArtworkTitle(): string | undefined {
    const castInfo = canvasService.getCastInfo();

    if (
      castInfo?.castCommand !== CastCommand.displayPlaylist ||
      !Array.isArray(castInfo.playlist?.items) ||
      !castInfo.playlist.items.length
    ) {
      return undefined;
    }

    const playingArtwork = castInfo.playlist.items[castInfo.index ?? 0];
    return playingArtwork.title?.trim() ?? undefined;
  }

  useEffect(() => {
    const errorType = searchParams.get('error');

    if (!errorType) {
      return;
    }

    switch (errorType) {
      case ErrorType.Overheating.toString(): {
        const playingArtworkTitle = getPlayingArtworkTitle();
        setTitle('System overheating detected');
        setMessage(
          `The Art Computer's temperature has exceeded safe operating levels` +
            (playingArtworkTitle
              ? ` while viewing ${playingArtworkTitle}`
              : '') +
            `. To prevent damage, playback has been paused. Restart the Art Computer to continue viewing the artwork.`
        );
        break;
      }

      case ErrorType.ServiceFailed.toString(): {
        setTitle('Service failed');
        setMessage(
          'The Art Computer encountered an unexpected issue and has stopped working. Restart it, and if the problem persists, contact support@feralfile.com.'
        );
        break;
      }

      default: {
        console.error('[ErrorPage] Unknown error type');
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
