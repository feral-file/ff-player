export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
  ServiceFailed = 'ServiceFailed',
}

export enum CustomEventName {
  ConnectivityChange = 'connectivityChange',
  // CanvasService → AppContext: a displayDefaultPlaylist command asked for the
  // default playlist; AppContext re-arms its boot fallback loop so the command
  // and the player's own pull resolve the playlist through one code path.
  DisplayDefaultPlaylist = 'displayDefaultPlaylist',
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
  Scanning = 'scanning',
  SoftApQr = 'softap_qr',
  Joining = 'joining',
  JoinFailed = 'join_failed',
  Updating = 'updating',
  Finalizing = 'finalizing',
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
  // claim_qr only: the device's mDNS-advertised name (e.g. "FF1-8EVTK3RE"),
  // woven into the "the app finds this frame automatically" guidance.
  // snake_case matches the setupDisplay wire contract field.
  device_name?: string;
}
