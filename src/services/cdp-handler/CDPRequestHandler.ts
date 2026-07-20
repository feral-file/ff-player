import { canvasService } from '../CanvasService';
import { WebSocketMessage } from '@/models';
import {
  ConnectivityEventDetail,
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
  SetupDisplayDetail,
  SetupDisplayState,
  WatchdogEvent,
} from '@/models/custom_event';
import {
  handleOverheatingError,
  handleServiceFailedError,
} from '@/utils/ErrorNavigation';

const pingCommand = 'ping';
const mintPairingDisplayCommand = 'mintPairingDisplay';
const setupDisplayCommand = 'setupDisplay';

/** Bridges native CDP callbacks into player services and browser events. */
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
    if (this.isInitialized) {
      return;
    }

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

  private handleCDPRequest(
    event: WebSocketMessage | Record<string, unknown>
  ): string {
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
        return this.handleCommandRequest(wsMessage, event.messageID as string);
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

  private handleCommandRequest(
    wsMessage: Record<string, unknown>,
    messageID?: string
  ) {
    console.log('[CDP Handler] Command request received');
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

      case mintPairingDisplayCommand: {
        reply = {
          messageID,
          message: this.handleMintPairingDisplay(wsMessage.request),
        };
        break;
      }

      case setupDisplayCommand: {
        reply = {
          messageID,
          message: this.handleSetupDisplay(wsMessage.request),
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

  private handleMintPairingDisplay(request: unknown) {
    if (!isMintPairingDisplayDetail(request)) {
      return { ok: false, error: 'Invalid mint pairing display request' };
    }

    window.dispatchEvent(
      new CustomEvent<MintPairingDisplayDetail>(
        CustomEventName.MintPairingDisplay,
        { detail: request }
      )
    );
    return { ok: true };
  }

  private handleSetupDisplay(request: unknown) {
    if (!isSetupDisplayDetail(request)) {
      return { ok: false, error: 'Invalid setup display request' };
    }

    window.dispatchEvent(
      new CustomEvent<SetupDisplayDetail>(CustomEventName.SetupDisplay, {
        detail: request,
      })
    );
    return { ok: true };
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
      console.log('[CDP Handler] Watchdog event received');

      switch (event) {
        case WatchdogEvent.CriticalCPUTemperature.toString(): {
          handleOverheatingError();
          return JSON.stringify({
            message: { ok: true },
          });
        }

        case WatchdogEvent.ServiceFailed.toString(): {
          handleServiceFailedError();
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

/** Validate CDP-owned mint pairing overlay state before dispatching it. */
function isMintPairingDisplayDetail(
  request: unknown
): request is MintPairingDisplayDetail {
  if (!request || typeof request !== 'object') {
    return false;
  }

  const detail = request as Partial<MintPairingDisplayDetail>;
  if (
    typeof detail.state !== 'string' ||
    !Object.values(MintPairingDisplayState).includes(
      detail.state
    )
  ) {
    return false;
  }

  if (
    detail.pairingCode !== undefined &&
    typeof detail.pairingCode !== 'string'
  ) {
    return false;
  }

  if (
    detail.state === MintPairingDisplayState.PairingCode &&
    !detail.pairingCode?.trim()
  ) {
    return false;
  }

  if (
    detail.browserName !== undefined &&
    typeof detail.browserName !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Validate CDP-owned setup overlay state before dispatching it. Only the
 * per-field shape for states this handler recognizes is enforced; unrecognized
 * `state` values are accepted as long as `state` itself is a non-empty
 * string, per the `setupDisplay` extensibility invariant (see
 * `SetupDisplayState` in models/custom_event.ts) — `SetupOverlay` is
 * responsible for safely no-oping on states it doesn't understand.
 */
function isSetupDisplayDetail(request: unknown): request is SetupDisplayDetail {
  if (!request || typeof request !== 'object') {
    return false;
  }

  const detail = request as Partial<SetupDisplayDetail>;
  if (typeof detail.state !== 'string' || !detail.state.trim()) {
    return false;
  }

  // `detail.state` is `string` (see SetupDisplayState doc comment), so cast
  // it for the switch: known branches stay type-checked against the enum,
  // while `default` still catches any other runtime string, including
  // future contract states this build doesn't recognize yet.
  switch (detail.state as SetupDisplayState) {
    case SetupDisplayState.SoftApQr: {
      if (typeof detail.ssid !== 'string' || !detail.ssid.trim()) {
        return false;
      }
      if (detail.password !== undefined && typeof detail.password !== 'string') {
        return false;
      }
      break;
    }

    case SetupDisplayState.JoinFailed: {
      if (detail.reason !== undefined && typeof detail.reason !== 'string') {
        return false;
      }
      break;
    }

    case SetupDisplayState.Updating: {
      // `Number.isFinite` (not `typeof === 'number'`) rejects NaN/Infinity,
      // which would otherwise pass the type check and reach the overlay as
      // "NaN%"/"Infinity%".
      if (
        detail.progress !== undefined &&
        !Number.isFinite(detail.progress)
      ) {
        return false;
      }
      break;
    }

    case SetupDisplayState.ClaimQr: {
      if (typeof detail.url !== 'string' || !detail.url.trim()) {
        return false;
      }
      break;
    }

    default: {
      break;
    }
  }

  return true;
}
