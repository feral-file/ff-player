import { canvasService } from '../CanvasService';
import { WebSocketMessage } from '@/models';
import {
  ConnectivityEventDetail,
  CustomEventName,
  WatchdogEvent,
} from '@/models/custom_event';
import { handleOverheatingError } from '@/utils/ErrorNavigation';
import DeviceManager from '@/utils/DeviceManager';
import { DeviceNamePrefix } from '@/constants';

const sendDeviceInfoCommand = 'sendDeviceInfo';
const pingCommand = 'ping';

export class CDPRequestHandler {
  private static instance: CDPRequestHandler | null = null;
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  public static getInstance(): CDPRequestHandler {
    if (!CDPRequestHandler.instance) {
      CDPRequestHandler.instance = new CDPRequestHandler();
    }
    return CDPRequestHandler.instance;
  }

  public initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleCDPRequest = this.handleCDPRequest.bind(this);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleConnectivityChange =
      this.handleConnectivityChange.bind(this);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleWatchdogEvent = this.handleWatchdogEvent.bind(this);
  }

  public cleanup() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleCDPRequest = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleConnectivityChange = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleWatchdogEvent = null;
    this.isInitialized = false;
  }

  private handleCDPRequest(event: WebSocketMessage): string {
    try {
      console.log('[CDP] Request received');
      if (!event.message) {
        throw Error('Empty message');
      }

      const wsMessage =
        typeof event.message === 'string'
          ? (JSON.parse(event.message) as Record<string, unknown>)
          : (event.message as Record<string, unknown>);

      if (wsMessage.command) {
        return this.handleCommandRequest(event.messageID, wsMessage);
      }

      throw Error(`Invalid message: ${JSON.stringify(wsMessage)}`);
    } catch (error) {
      console.error('[CDP] Error handling CDP request:', error);
      return JSON.stringify({
        messageID: event.messageID,
        message: { ok: false, error: (error as Error).message },
      });
    }
  }

  private handleCommandRequest(
    messageID: string,
    wsMessage: Record<string, unknown>
  ) {
    console.log('[CDP] Command request received:', JSON.stringify(wsMessage));
    const command = wsMessage.command as string;
    let reply: WebSocketMessage | null = null;
    switch (command) {
      case pingCommand: {
        reply = {
          messageID,
          message: { ok: true },
        };
        break;
      }

      case sendDeviceInfoCommand: {
        const request = wsMessage.request as Record<string, unknown> | null;
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

        reply = {
          messageID,
          message: { ok: true },
        };
        break;
      }

      default: {
        const responseMessage = canvasService.processMessage(wsMessage);
        reply = {
          messageID,
          message: responseMessage,
        };
        break;
      }
    }

    return JSON.stringify(reply);
  }

  private handleConnectivityChange(isOnline: boolean) {
    window.dispatchEvent(
      new CustomEvent<ConnectivityEventDetail>(
        CustomEventName.ConnectivityChange,
        {
          detail: { isOnline },
        }
      )
    );
  }

  public handleWatchdogEvent(event: string) {
    try {
      console.log('[CDP] Watchdog event received:', event);

      switch (event as WatchdogEvent) {
        case WatchdogEvent.CriticalCPUTemperature: {
          handleOverheatingError();
          return JSON.stringify({
            message: { ok: true },
          });
        }

        default: {
          console.error('[CDP] Unknown watchdog event');
          return JSON.stringify({
            message: { ok: false, error: 'Unknown watchdog event' },
          });
        }
      }
    } catch (error) {
      console.error('[CDP] Error handling watchdog event:', error);
    }

    return false;
  }
}
