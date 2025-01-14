import { WebSocketMessage } from '@/utils/types';
import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from '../CanvasService';

export class LocalWebSocketClient {
  private ws: ReconnectingWebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  private connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return;
    this.isConnecting = true;

    try {
      this.ws = new ReconnectingWebSocket('ws://localhost:8080');

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
    console.log('Connected to Raspberry Pi');
    this.isConnecting = false;
    this.ping(); // Request initial system info
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
    this.isConnecting = false;
    this.ws = null;

    // Attempt to reconnect
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private handleError(event: unknown) {
    console.error('WebSocket error:', event);
  }

  public sendMessage(message: WebSocketMessage) {
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
