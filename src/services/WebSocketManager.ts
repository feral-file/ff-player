import { useState, useEffect, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from './CanvasService';
import { LocalStorageItem } from '@/constants';
import { CastInfo } from '@/utils/types';
import mixpanel from '@/utils/mixpanel';

const useWebSocket = (url: string, apiKey: string) => {
  const [locationID, setLocationID] = useState<string | null>(null);
  const [topicID, setTopicID] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<CastInfo | null>({
    dataChecked: false,
  });
  const [isDisconnected, setIsDisconnected] = useState<boolean>(false);
  const ws = useRef<ReconnectingWebSocket | null>(null);
  const canvasService = useRef(new CanvasService());

  useEffect(() => {
    const currentUser = localStorage.getItem(LocalStorageItem.currentUserId);
    if (
      castInfo?.dataChecked &&
      castInfo.primaryAddress &&
      (currentUser != castInfo.primaryAddress ||
        mixpanel.get_distinct_id() != castInfo.primaryAddress)
    ) {
      localStorage.setItem(
        LocalStorageItem.currentUserId,
        castInfo.primaryAddress
      );
      mixpanel.identify(castInfo.primaryAddress);
    }
  }, [castInfo]);

  useEffect(() => {
    if (!url || !apiKey) return;

    const connect = () => {
      let wsUrl = `${url}?apiKey=${apiKey}`;
      const storedLocationID = localStorage.getItem(
        LocalStorageItem.locationID
      );
      const storedTopicID = localStorage.getItem(LocalStorageItem.topicID);
      if (storedLocationID) wsUrl += `&locationID=${storedLocationID}`;
      if (storedTopicID) wsUrl += `&topicID=${storedTopicID}`;

      const castInfoString = localStorage.getItem(LocalStorageItem.castInfo);
      if (castInfoString) {
        canvasService.current.setCastInfo(
          JSON.parse(castInfoString) as CastInfo
        );

        setCastInfo({
          ...JSON.parse(castInfoString),
          dataChecked: true,
        } as CastInfo);
      } else {
        setCastInfo({ dataChecked: true });
      }

      ws.current = new ReconnectingWebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsDisconnected(false);
      };

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      ws.current.onmessage = async event => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = JSON.parse(event.data as string);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (data.messageID === 'system') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          setLocationID(data.message.locationID);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          setTopicID(data.message.topicID);
          localStorage.setItem(
            LocalStorageItem.locationID,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            data.message.locationID
          );
          localStorage.setItem(
            LocalStorageItem.topicID,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            data.message.topicID as string
          );
        } else {
          const responseMessage =
            await canvasService.current.processMessage(event);
          setCastInfo(canvasService.current.getCastInfo());
          if (responseMessage) {
            ws.current?.send(JSON.stringify(responseMessage));
          }
        }
      };

      ws.current.onerror = error => {
        console.error('WebSocket error:', error);
        setIsDisconnected(true);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        setIsDisconnected(true);
      };
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url, apiKey]);

  return { locationID, topicID, castInfo, canvasService, isDisconnected };
};

export default useWebSocket;
