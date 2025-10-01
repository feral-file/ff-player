'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageModal from '@/components/MessageModal';
import { ErrorType } from '@/models/error.model';
import { canvasService } from '@/services/CanvasService';
import { CastCommand } from '@/models';
import { IndexerService } from '@/services/IndexerService';
import { convertToTokenID } from '@/utils/indexer';

const ErrorPage = () => {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('Issue Detected');

  async function getPlayingArtworkTitle() {
    let playingArtworkTitle: string | undefined;
    const castInfo = canvasService.getCastInfo();
    switch (castInfo?.castCommand) {
      case CastCommand.displayPlaylist: {
        if (!castInfo.playlist?.items?.length) {
          break;
        }

        const playingArtwork = castInfo.playlist.items[castInfo.index ?? 0];
        if (playingArtwork.title) {
          playingArtworkTitle = playingArtwork.title;
          break;
        }

        if (!playingArtwork.provenance?.contract) {
          break;
        }

        const tokenID = convertToTokenID(
          playingArtwork.provenance.contract.chain,
          playingArtwork.provenance.contract.address,
          playingArtwork.provenance.contract.tokenId
        );
        const token = await IndexerService.queryIndexerToken(tokenID);
        playingArtworkTitle = token?.asset?.metadata.project.latest.title;
        break;
      }
    }

    return playingArtworkTitle;
  }

  useEffect(() => {
    const errorType = searchParams.get('error');

    switch (errorType) {
      case ErrorType.Overheating: {
        getPlayingArtworkTitle()
          .then(title => {
            setTitle('System Overheating Detected');
            setMessage(
              `The device temperature has exceeded safe operating levels${title ? ` while viewing ${title}` : ''}. To prevent damage, playback has been paused. Please reboot the device to continue viewing the artwork.`
            );
          })
          .catch((error: unknown) => {
            console.log(
              '[ErrorPage] Error when get current playing artwork title',
              error
            );
          });

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
