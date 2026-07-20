'use client';

import { useState, useEffect, useRef } from 'react';
import { canvasService } from '../CanvasService';
import { CastCommand, CastInfo } from '@/models';
import { stripEphemeralCastInfoFields } from '@/utils/castInfo';
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

    // Persist playlist/index recovery only — strip live renderStatus so a later
    // boot cannot report ready/failed before ArtworkPlayer mounts.
    const castInfoToStore = castInfo
      ? {
          ...stripEphemeralCastInfoFields(castInfo),
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
