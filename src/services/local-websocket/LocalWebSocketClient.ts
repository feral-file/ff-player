import ReconnectingWebSocket from 'reconnecting-websocket';
import CanvasService from '../CanvasService';
import { WebSocketMessage } from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import { DeviceNamePrefix, LocalStorageItem, Platform } from '@/constants';

const sendDeviceInfoCommand = 'sendDeviceInfo';
const pingCommand = 'ping';

export class LocalWebSocketClient {
  private ws: ReconnectingWebSocket | null = null;
  private isConnecting = false;
  private connectionAttempts = 0;
  private static instance: LocalWebSocketClient;
  private connectionListeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public static getInstance(): LocalWebSocketClient {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!LocalWebSocketClient.instance) {
      LocalWebSocketClient.instance = new LocalWebSocketClient();
    }
    return LocalWebSocketClient.instance;
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public onConnected(callback: () => void): void {
    this.connectionListeners.push(callback);
  }

  public removeOnConnected(callback: () => void): void {
    this.connectionListeners = this.connectionListeners.filter(
      listener => listener !== callback
    );
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

    this.connectionListeners.forEach(listener => {
      listener();
    });
  }

  private async handleMessage(event: MessageEvent) {
    try {
      console.log('[WebSocket] Message event received:', JSON.stringify(event));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const wsEventData = JSON.parse(event.data) as WebSocketMessage | null;
      if (!wsEventData?.message) {
        console.error(
          '[WebSocket] Invalid message:',
          JSON.stringify(event.data)
        );
        return;
      }

      console.log('[WebSocket] Event data:', JSON.stringify(wsEventData));

      const messageData = JSON.parse(wsEventData.message as string) as Record<
        string,
        unknown
      >;

      console.log('[WebSocket] Message data:', JSON.stringify(messageData));

      const messageCommand = messageData.command as string | null;
      if (!messageCommand) {
        console.error('[WebSocket] Command not found in the message:');
        return;
      }

      if (messageCommand === pingCommand) {
        this.sendMessage({
          messageID: wsEventData.messageID,
          message: { ok: true },
        });
        return;
      }

      const platform = localStorage.getItem(LocalStorageItem.platform);
      if (
        messageCommand === sendDeviceInfoCommand &&
        platform === Platform.ffDevice
      ) {
        const request = messageData.request as Record<string, unknown> | null;
        console.log(
          '[WebSocket] Send device info request:',
          JSON.stringify(request)
        );

        const deviceId = request?.deviceId;
        if (deviceId) {
          DeviceManager.setDeviceId(deviceId as string);
        }

        const version = request?.version;
        if (version) {
          DeviceManager.setName(
            DeviceNamePrefix.ffDevice + (version as string)
          );
        }

        return;
      }

      const responseMessage =
        await CanvasService.getInstance().processMessage(messageData);
      if (responseMessage) {
        this.sendMessage({
          messageID: wsEventData.messageID,
          message: responseMessage,
        });
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
    console.log('sendMessage', JSON.stringify(message));
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
