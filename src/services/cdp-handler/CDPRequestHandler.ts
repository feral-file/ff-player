import CanvasService from '../CanvasService';
import { WebSocketMessage } from '@/models';
import DeviceManager from '@/utils/DeviceManager';
import { DeviceNamePrefix } from '@/constants';
import { ConnectivityEventDetail } from '../custom-hooks/useNetworkManager';

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
    (window as any).getCurrentOrientation =
      this.getCurrentOrientation.bind(this);
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
      new CustomEvent<ConnectivityEventDetail>('connectivityChange', {
        detail: { isOnline },
      })
    );
  }

  public getCurrentOrientation(): string {
    const displaySettings = CanvasService.getInstance().getDisplaySettings();

    return JSON.stringify({
      isLandscape: (displaySettings?.rotationAngle ?? 0) % 180 === 0,
    });
  }

  public cleanup() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleCDPRequest = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleConnectivityChange = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).getCurrentOrientation = null;
    this.isInitialized = false;
  }
}
