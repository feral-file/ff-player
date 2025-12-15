import { canvasService } from '../CanvasService';
import { WebSocketMessage } from '@/models';
import {
  ConnectivityEventDetail,
  CustomEventName,
  WatchdogEvent,
} from '@/models/custom_event';
import { handleOverheatingError } from '@/utils/ErrorNavigation';

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
    CDPRequestHandler.instance ??= new CDPRequestHandler();
    return CDPRequestHandler.instance;
  }

  public initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (window as any).handleCDPRequest = async (
      event: WebSocketMessage | Record<string, unknown>
    ) => {
      return await this.handleCDPRequest(event);
    };
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

  private async handleCDPRequest(
    event: WebSocketMessage | Record<string, unknown>
  ): Promise<string> {
    try {
      let wsMessage: Record<string, unknown>;

      if (!event.messageID && !event.message) {
        // New format with no messageID required on reply
        wsMessage = event as Record<string, unknown>;
      } else {
        // FIXME: Remove this once the legacy format is no longer supported.
        // Handle messageID and message support the legacy format.
        if (!event.message) {
          throw new Error('Empty message');
        }

        if (typeof event.message === 'string') {
          try {
            wsMessage = JSON.parse(event.message) as Record<string, unknown>;
          } catch {
            throw new Error(`Failed to parse message: ${event.message}`);
          }
        } else {
          wsMessage = event.message as Record<string, unknown>;
        }
      }

      if (typeof wsMessage !== 'object') {
        throw new Error('Malformed message: not an object');
      }

      if (wsMessage.command) {
        return await this.handleCommandRequest(
          wsMessage,
          event.messageID as string
        );
      }

      throw new Error(`Invalid message: ${JSON.stringify(wsMessage)}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[CDP] Error handling CDP request:', error);
      return JSON.stringify({
        messageID: event.messageID,
        message: { ok: false, error: errMsg },
      });
    }
  }

  private async handleCommandRequest(
    wsMessage: Record<string, unknown>,
    messageID?: string
  ): Promise<string> {
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

      default: {
        const responseMessage = await canvasService.processMessage(wsMessage);
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

      switch (event) {
        case WatchdogEvent.CriticalCPUTemperature.toString(): {
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
