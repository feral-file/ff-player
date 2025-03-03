'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { ArtFraming } from '@/utils/types';
import DeviceManager from '@/utils/DeviceManager';

const useFrameConfig = () => {
  const [frameConfig, setFrameConfig] = useState<ArtFraming>(
    ArtFraming.FitToScreen
  );
  const canvasService = useRef(CanvasService.getInstance());
  const isFirstRender = useRef(true);

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

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    DeviceManager.setArtFrameConfig(frameConfig);
  }, [frameConfig]);

  return { frameConfig, setFrameConfig };
};

export default useFrameConfig;
