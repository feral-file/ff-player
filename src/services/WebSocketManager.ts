import { useState, useEffect, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from './CanvasService';
import { LocalStorageItem } from '@/constants';
import { CastInfo } from '@/utils/types';

const pingIntervalTime = 5 * 60 * 1000; // 5 minutes
const pongWaitTime = 10 * 1000;

const useWebSocket = (url: string, apiKey: string) => {
  const [locationID, setLocationID] = useState<string | null>(null);
  const [topicID, setTopicID] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<CastInfo | null>({
    dataChecked: false,
  });
  const [isDisconnected, setIsDisconnected] = useState<boolean>(false);
  const ws = useRef<ReconnectingWebSocket | null>(null);
  const canvasService = useRef(new CanvasService());
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

      setCastInfo({ dataChecked: true });

      ws.current = new ReconnectingWebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('[WS] WebSocket connected to:', wsUrl);
        setIsDisconnected(false);
        // Retrieve cast info from local storage to keep the state when refresh page
        const castInfo = localStorage.getItem(LocalStorageItem.castInfo);
        if (castInfo) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          canvasService.current.setCastInfo(JSON.parse(castInfo));
          setCastInfo(canvasService.current.getCastInfo());
        }

        pingIntervalRef.current = setInterval(() => {
          ws.current?.send(
            JSON.stringify({ messageID: 'ping', message: 'ping' })
          );
          pongTimeoutRef.current = setTimeout(() => {
            console.log(
              '[WS] No pong received within the expected time. WebSocket seems disconnected.'
            );
            setIsDisconnected(true);
          }, pongWaitTime);
        }, pingIntervalTime); // ping every 5 minutes
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
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        else if (data.messageID === 'ping') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (data.message === 'pong') {
            console.log('[WS] Pong received');
            setIsDisconnected(false);
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
            }
          }
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
        console.error('[WS] WebSocket error:', JSON.stringify(error));
        setIsDisconnected(true);
      };

      ws.current.onclose = () => {
        console.log('[WS] WebSocket disconnected, attempting to reconnect...');
        setIsDisconnected(true);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
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
