import CanvasService from '../CanvasService';
import { WebSocketMessage } from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import { DeviceNamePrefix } from '@/constants';
import {
  ConnectivityEventDetail,
  CustomEventName,
  WatchdogEvent,
} from '@/models/custom_event';
import { handleOverheatingError } from '@/utils/ErrorNavigation';
import { DP1, DP1Action } from '@/models/dp1.model';

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
      console.log('[CDP] Request received:', event);
      if (!event.message) {
        console.error('[CDP] Empty message');
        throw Error('Empty message');
      }

      const wsMessage =
        typeof event.message === 'string'
          ? (JSON.parse(event.message) as Record<string, unknown>)
          : (event.message as Record<string, unknown>);

      console.log('[CDP] WS Message:', JSON.stringify(wsMessage));

      if (wsMessage.dp1_call) {
        return this.handleDP1Request(
          event.messageID,
          wsMessage as unknown as DP1
        );
      }

      const messageCommand = wsMessage.command as string | null;
      if (!messageCommand) {
        console.error('[CDP] Command not found in the message');
        throw Error('Command not found in the message');
      }

      let reply: WebSocketMessage | null = null;
      switch (messageCommand) {
        case pingCommand: {
          reply = {
            messageID: event.messageID,
            message: { ok: true },
          };
          break;
        }

        case sendDeviceInfoCommand: {
          const request = wsMessage.request as Record<string, unknown> | null;
          console.log(
            '[CDP] Send device info request:',
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

          reply = {
            messageID: event.messageID,
            message: { ok: true },
          };
          break;
        }

        default: {
          const responseMessage =
            CanvasService.getInstance().processMessage(wsMessage);
          reply = {
            messageID: event.messageID,
            message: responseMessage,
          };
          break;
        }
      }

      return JSON.stringify(reply);
    } catch (error) {
      console.error('Error handling CDP request:', error);
      return JSON.stringify({
        messageID: event.messageID,
        message: { ok: false, error: (error as Error).message },
      });
    }
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

  private handleDP1Request(messageID: string, dp1Object: DP1) {
    try {
      console.log('[CDP] DP1 request received:', JSON.stringify(dp1Object));

      const action = dp1Object.intent.action;

      let reply: WebSocketMessage | null = null;
      switch (action) {
        case DP1Action.NowDisplay: {
          const responseMessage = CanvasService.getInstance().processDP1Message(
            dp1Object.dp1_call
          );
          reply = {
            messageID,
            message: responseMessage,
          };
          break;
        }

        case DP1Action.NowPlay: {
          reply = {
            messageID,
            message: { ok: true },
          };
          break;
        }

        case DP1Action.GetCurrentPlaylist: {
          break;
        }

        default: {
          break;
        }
      }

      return JSON.stringify(reply);
    } catch (error) {
      console.error('Error handling CDP request:', error);
      return JSON.stringify({
        messageID,
        message: { ok: false, error: (error as Error).message },
      });
    }
  }
}
