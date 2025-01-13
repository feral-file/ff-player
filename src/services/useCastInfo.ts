'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { CastInfo } from '@/utils/types';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(
    CanvasService.getInstance().getCastInfo()
  );
  const canvasService = useRef(CanvasService.getInstance());

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

  return { castInfo, setCastInfo };
};

export default useCastInfo;
