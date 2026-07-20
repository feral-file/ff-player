export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
  ServiceFailed = 'ServiceFailed',
}

export enum CustomEventName {
  ConnectivityChange = 'connectivityChange',
  MintPairingDisplay = 'mintPairingDisplay',
  Navigate = 'navigate',
  SetupDisplay = 'setupDisplay',
  WatchdogEvent = 'watchdogEvent',
}

export interface ConnectivityEventDetail {
  isOnline: boolean;
}

export interface WatchdogEventDetail {
  event: WatchdogEvent;
}

export interface NavigateEventDetail {
  path: string;
}

export enum MintPairingDisplayState {
  Hidden = 'hidden',
  PairingCode = 'pairing_code',
  RequestReceived = 'request_received',
  CreatingToken = 'creating_token',
}

export interface MintPairingDisplayDetail {
  state: MintPairingDisplayState;
  pairingCode?: string;
  browserName?: string;
}

/**
 * Known `setupDisplay` states as of this player build. `SetupOverlay` renders
 * nothing for any state string outside this set instead of erroring, so
 * `feral-controld` can ship new setup states (e.g. a future LAN
 * pairing-approval overlay) without breaking players that predate them.
 */
export enum SetupDisplayState {
  Hidden = 'hidden',
  Ready = 'ready',
  SoftApQr = 'softap_qr',
  Joining = 'joining',
  JoinFailed = 'join_failed',
  Updating = 'updating',
  ClaimQr = 'claim_qr',
  FactoryReset = 'factory_reset',
}

export interface SetupDisplayDetail {
  // Intentionally `string`, not `SetupDisplayState`, so the CDP handler can
  // accept and forward states this player build does not yet recognize.
  state: string;
  ssid?: string;
  password?: string;
  reason?: string;
  progress?: number;
  url?: string;
}
