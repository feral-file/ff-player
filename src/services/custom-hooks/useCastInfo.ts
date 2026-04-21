'use client';

import { useState, useEffect, useRef } from 'react';
import { canvasService } from '../CanvasService';
import { CastCommand, CastInfo } from '@/models';
import { stripLegacyCastPlaybackTimeline } from '@/utils/castInfo';
import DeviceManager from '@/utils/DeviceManager';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const isFirstRender = useRef(true);

  const isPlaylistControlCommand = (castInfo: CastInfo) => {
    return (
      castInfo.castCommand &&
      [
        CastCommand.moveToArtwork,
        CastCommand.updateIndex,
        CastCommand.refreshPlaylist,
        CastCommand.setShuffle,
        CastCommand.setLoop,
      ].includes(castInfo.castCommand)
    );
  };

  useEffect(() => {
    const handleCastInfoChange = (newCastInfo: CastInfo | null) => {
      setCastInfo(newCastInfo);
    };

    // Subscribe to cast info changes
    canvasService.onCastInfoChange = handleCastInfoChange;

    return () => {
      // Cleanup subscription
      canvasService.onCastInfoChange = null;
    };
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (castInfo?.castCommand === CastCommand.updateIndex) {
      // TODO: Send cast info to app
    }

    const castInfoToStore = castInfo
      ? {
          ...stripLegacyCastPlaybackTimeline(castInfo),
          castCommand: isPlaylistControlCommand(castInfo)
            ? CastCommand.displayPlaylist
            : castInfo.castCommand,
        }
      : null;

    DeviceManager.setDeviceInfo(castInfoToStore).catch((error: unknown) => {
      console.error('[useCastInfo] Error saving castInfo:', error);
    });
  }, [castInfo]);

  return { castInfo, setCastInfo };
};

export default useCastInfo;
