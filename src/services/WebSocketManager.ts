import { useState, useEffect, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from './CanvasService';
import { LocalStorageItem } from '@/constants';
import { CastInfo } from '@/utils/types';

let webSocketInstance: any = null;

const useWebSocket = (url: string, apiKey: string) => {
  const [locationID, setLocationID] = useState<string | null>(null);
  const [topicID, setTopicID] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<CastInfo | null>({
    dataChecked: false,
  });
  const ws = useRef<ReconnectingWebSocket | null>(null);
  const canvasService = useRef(new CanvasService());

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

      const castInfo = localStorage.getItem(LocalStorageItem.castInfo);
      if (castInfo) {
        canvasService.current.setCastInfo(JSON.parse(castInfo));
        setCastInfo({
          ...JSON.parse(castInfo),
          dataChecked: true,
        } as CastInfo);
      } else {
        setCastInfo({ dataChecked: true });
      }

      ws.current = new ReconnectingWebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.current.onmessage = async event => {
        const data = JSON.parse(event.data);
        if (data.messageID === 'system') {
          setLocationID(data.message.locationID);
          setTopicID(data.message.topicID);
          localStorage.setItem(
            LocalStorageItem.locationID,
            data.message.locationID
          );
          localStorage.setItem(LocalStorageItem.topicID, data.message.topicID);
        } else {
          const responseMessage = await canvasService.current.processMessage(
            event
          );
          setCastInfo(canvasService.current.getCastInfo());
          if (responseMessage) {
            ws.current?.send(JSON.stringify(responseMessage));
          }
        }
      };

      ws.current.onerror = error => {
        console.error('WebSocket error:', error);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
      };
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url, apiKey]);

  return { locationID, topicID, castInfo, canvasService };
};

export default useWebSocket;
