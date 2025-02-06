'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { ArtFraming } from '@/utils/types';

const useFrameConfig = () => {
  const [frameConfig, setFrameConfig] = useState<ArtFraming>(
    ArtFraming.FitToScreen
  );
  const canvasService = useRef(CanvasService.getInstance());

  useEffect(() => {
    const handleFrameConfigChanged = (artFrame: ArtFraming | null) => {
      setFrameConfig(artFrame ?? ArtFraming.FitToScreen);
    };

    const service = canvasService.current;
    service.onFrameConfigUpdated = handleFrameConfigChanged;

    return () => {
      service.onCastInfoChange = null;
    };
  }, []);

  return { frameConfig };
};

export default useFrameConfig;
