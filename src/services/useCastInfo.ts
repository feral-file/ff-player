'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { CastCommand, CastInfo } from '@/utils/types';
import { LocalStorageItem } from '@/constants';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const canvasService = useRef(CanvasService.getInstance());
  const isFirstRender = useRef(true);

  const shouldStoreCastInfo = () => {
    return (
      !castInfo?.castCommand ||
      ![
        CastCommand.pauseCasting,
        CastCommand.resumeCasting,
        CastCommand.nextArtwork,
        CastCommand.previousArtwork,
      ].includes(castInfo.castCommand)
    );
  };

  useEffect(() => {
    const handleCastInfoChange = (newCastInfo: CastInfo | null) => {
      setCastInfo(newCastInfo);
    };

    // Subscribe to cast info changes
    const service = canvasService.current;
    service.onCastInfoChange = handleCastInfoChange;

    return () => {
      // Cleanup subscription
      service.onCastInfoChange = null;
    };
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (shouldStoreCastInfo()) {
      if (
        castInfo?.castCommand &&
        [CastCommand.updateDuration, CastCommand.moveToArtwork].includes(
          castInfo.castCommand
        )
      ) {
        castInfo.castCommand = CastCommand.castListArtwork;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      localStorage?.setItem(
        LocalStorageItem.castInfo,
        JSON.stringify(castInfo)
      );
    }
  }, [castInfo]);

  return { castInfo, setCastInfo };
};

export default useCastInfo;
