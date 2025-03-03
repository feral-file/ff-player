import { WebSocketMessage } from '@/utils/types';
import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from '../CanvasService';
import { LocalStorageItem } from '@/constants';

export class LocalWebSocketClient {
  private ws: ReconnectingWebSocket | null = null;
  private isConnecting = false;
  private connectionAttempts = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  private connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.isConnecting = true;

    try {
      this.ws = new ReconnectingWebSocket('ws://localhost:8080', [], {
        reconnectionDelayGrowFactor: 1.3,
        minReconnectionDelay: 1000,
        maxReconnectionDelay: 30000,
      });

      this.ws.onopen = this.handleOpen.bind(this);
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.handleClose();
    }
  }

  private handleOpen() {
    this.connectionAttempts++;
    console.log('Connected to Raspberry Pi');
    this.isConnecting = false;

    // Only ping on initial connection
    if (this.connectionAttempts === 1) {
      this.ping();
    }

    const castInfo = localStorage.getItem(LocalStorageItem.castInfo);
    if (castInfo) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      CanvasService.getInstance().setCastInfo(JSON.parse(castInfo));
    }
  }

  private async handleMessage(event: MessageEvent) {
    try {
      console.log('handleMessage', event);
      const responseMessage =
        await CanvasService.getInstance().processMessage(event);
      if (responseMessage) {
        this.sendMessage(responseMessage);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  private handleClose() {
    console.log('WebSocket connection closed');
    this.isConnecting = false;
  }

  private handleError(event: unknown) {
    console.error('WebSocket error:', event);
  }

  public sendMessage(message: WebSocketMessage) {
    console.log('sendMessage this.ws', this.ws);
    console.log('this.ws.readyState', this.ws?.readyState);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  // Convenience methods
  public ping() {
    const message: WebSocketMessage = {
      messageID: 'ping',
      message: JSON.stringify({}),
    };
    this.sendMessage(message);
  }

  public disconnect() {
    this.ws?.close();
  }
}
