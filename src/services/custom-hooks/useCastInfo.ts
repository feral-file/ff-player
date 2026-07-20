'use client';

import { useState, useEffect, useRef } from 'react';
import { canvasService } from '../CanvasService';
import { CastCommand, CastInfo } from '@/models';
import { stripEphemeralCastInfoFields } from '@/utils/castInfo';
import DeviceManager from '@/utils/DeviceManager';
import { deepEqual } from '@/utils/helper';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const isFirstRender = useRef(true);
  // Last payload written to DeviceManager after ephemeral strip + command rewrite.
  // undefined = never persisted in this mount; used to skip renderStatus-only churn.
  const lastPersistedCastInfoRef = useRef<CastInfo | null | undefined>(
    undefined
  );

  const isPlaylistControlCommand = (castInfo: CastInfo) => {
    return (
      castInfo.castCommand &&
      [
        CastCommand.moveToArtwork,
        CastCommand.updateIndex,
        CastCommand.refreshPlaylist,
        CastCommand.setShuffle,
        CastCommand.setLoop,
        // Persisting the raw command would make boot replay a control-only
        // command with no playlist populate step (black screen); like the
        // others above, a duration change mid-playback must recover as a
        // full displayPlaylist.
        CastCommand.updateDefaultDuration,
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

    // setRenderStatus notifies on every pending/loading/ready/failed flip. After
    // strip, those payloads match the prior write — skip IndexedDB churn.
    if (
      lastPersistedCastInfoRef.current !== undefined &&
      deepEqual(lastPersistedCastInfoRef.current, castInfoToStore)
    ) {
      return;
    }
    lastPersistedCastInfoRef.current = castInfoToStore;

    DeviceManager.setDeviceInfo(castInfoToStore).catch((error: unknown) => {
      console.error('[useCastInfo] Error saving castInfo:', error);
    });
  }, [castInfo]);

  return { castInfo, setCastInfo };
};

export default useCastInfo;
