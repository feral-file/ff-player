'use client';

import { useState, useEffect, useRef } from 'react';
import { canvasService } from '../CanvasService';
import { CastCommand, CastInfo } from '@/models';
import { LocalStorageItem } from '@/constants';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const isFirstRender = useRef(true);

  const isPlaylistControlCommand = (castInfo: CastInfo) => {
    return (
      castInfo.castCommand &&
      [
        CastCommand.moveToArtwork,
        CastCommand.pauseCasting,
        CastCommand.resumeCasting,
        CastCommand.nextArtwork,
        CastCommand.previousArtwork,
        CastCommand.updateDuration,
        CastCommand.updateIndex,
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

    const castInfoToStore = castInfo;
    if (castInfoToStore && isPlaylistControlCommand(castInfoToStore)) {
      castInfoToStore.castCommand = CastCommand.castListArtwork;
    }

    delete castInfoToStore?.elapsedTime;
    delete castInfoToStore?.remainTime;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    localStorage?.setItem(
      LocalStorageItem.castInfo,
      JSON.stringify(castInfoToStore)
    );
  }, [castInfo]);

  return { castInfo, setCastInfo };
};

export default useCastInfo;
