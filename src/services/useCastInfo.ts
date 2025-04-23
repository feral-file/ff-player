'use client';

import { useState, useEffect, useRef } from 'react';
import CanvasService from './CanvasService';
import { CastCommand, CastInfo } from '@/models';
import { LocalStorageItem } from '@/constants';
import { LocalWebSocketClient } from './local-websocket/LocalWebSocketClient';
import { WebSocketMessage } from '@/models';

const useCastInfo = () => {
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const isFirstRender = useRef(true);

  // Services
  const canvasService = useRef(CanvasService.getInstance());
  const webSocketClient = useRef(LocalWebSocketClient.getInstance());

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

    if (castInfo?.castCommand === CastCommand.updateIndex) {
      // Send message to WebSocket
      const message: WebSocketMessage = {
        messageID: 'statusChanged',
        message: JSON.stringify({
          index: castInfo.index,
        }),
      };
      webSocketClient.current.sendMessage(message);
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
