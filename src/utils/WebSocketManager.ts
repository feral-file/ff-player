import { useState, useEffect, useRef } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import CanvasService from "./CanvasService";
import { WebsocketEvent } from "./types";

const useWebSocket = (url: string, apiKey: string) => {
  const [locationID, setLocationID] = useState<string | null>(null);
  const [topicID, setTopicID] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<any | null>(null);
  const [websocketEvent, setWebsocketEvent] = useState<
    WebsocketEvent | undefined
  >();
  const ws = useRef<ReconnectingWebSocket | null>(null);
  const canvasService = useRef(new CanvasService());

  useEffect(() => {
    if (!url || !apiKey) return;

    const connect = () => {
      const storedLocationID = localStorage.getItem("locationID");
      const storedTopicID = localStorage.getItem("topicID");

      let wsUrl = `${url}?apiKey=${apiKey}`;
      if (storedLocationID) wsUrl += `&locationID=${storedLocationID}`;
      if (storedTopicID) wsUrl += `&topicID=${storedTopicID}`;

      ws.current = new ReconnectingWebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected");
      };

      ws.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.messageID === "system") {
          setLocationID(data.message.locationID);
          setTopicID(data.message.topicID);
          localStorage.setItem("locationID", data.message.locationID);
          localStorage.setItem("topicID", data.message.topicID);
        } else {
          console.log("Received:", data);
          const responseMessage = await canvasService.current.processMessage(
            event
          );
          setCastInfo(canvasService.current.getCastInfo());
          setWebsocketEvent(canvasService.current.getWebsocketEvent());
          if (responseMessage) {
            ws.current?.send(JSON.stringify(responseMessage));
          }
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.current.onclose = () => {
        console.log("WebSocket disconnected, attempting to reconnect...");
      };
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url, apiKey]);

  return { locationID, topicID, castInfo, websocketEvent };
};

export default useWebSocket;
