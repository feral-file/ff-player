// Get, set, cache for specific artwork display settings

import { useEffect, useState } from 'react';
import { ArtFraming } from './AppControls';
import { useAppContext } from '@/context/AppContext';
import { Event, EventEmitter } from '@/utils/EventEmitter';

export interface ArtDisplaySetting {
  frameConfig: ArtFraming;
  rotateRadius: number;
}

const useArtDisplaySetting = () => {
  const { context } = useAppContext();
  const [artDisplaySetting, setArtDisplaySetting] =
    useState<ArtDisplaySetting>();

  const updateArtSetting = (setting: ArtDisplaySetting) => {
    setArtDisplaySetting(setting);
    EventEmitter.emit(Event.updateCurrentDisplaySetting, setting);
  };

  useEffect(() => {
    const setting = {
      frameConfig: context.appControl.frameConfig ?? ArtFraming.FitToScreen,
      rotateRadius: context.deviceRotation?.rotateRadius ?? 0,
    };
    setting.rotateRadius = 0; // Reset rotation if the device is rotated

    updateArtSetting(setting);
  }, [context.appControl.frameConfig, context.deviceRotation]);

  useEffect(() => {
    const handleSettingUpdate = (setting: ArtDisplaySetting) => {
      setArtDisplaySetting(setting);
    };

    EventEmitter.subscribe(
      Event.updateCurrentDisplaySetting,
      handleSettingUpdate as unknown as () => void
    );
    return () => {
      EventEmitter.unSubscribe(
        Event.updateCurrentDisplaySetting,
        handleSettingUpdate as unknown as () => void
      );
    };
  }, []);

  return { artDisplaySetting, updateArtSetting };
};

export default useArtDisplaySetting;
