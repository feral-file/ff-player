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

    if (!errorType) return;

    if (errorType === ErrorType.Overheating.toString()) {
      const playingArtworkTitle = getPlayingArtworkTitle();
      setTitle('System Overheating Detected');
      setMessage(
        `The device temperature has exceeded safe operating levels` +
          (playingArtworkTitle ? ` while viewing ${playingArtworkTitle}` : '') +
          `. To prevent damage, playback has been paused. Please reboot the device to continue viewing the artwork.`
      );
    }
    // More error types in the future as needed
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
