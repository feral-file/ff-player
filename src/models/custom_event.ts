export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
  ServiceFailed = 'ServiceFailed',
}

export enum CustomEventName {
  ConnectivityChange = 'connectivityChange',
  MintPairingDisplay = 'mintPairingDisplay',
  Navigate = 'navigate',
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
