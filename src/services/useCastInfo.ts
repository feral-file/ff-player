'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { CastInfo } from '@/utils/types';
import { LocalStorageItem } from '@/constants';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const canvasService = useRef(CanvasService.getInstance());
  const isFirstRender = useRef(true);

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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    localStorage?.setItem(LocalStorageItem.castInfo, JSON.stringify(castInfo));
  }, [castInfo]);

  return { castInfo, setCastInfo };
};

export default useCastInfo;
