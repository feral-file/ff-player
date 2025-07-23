export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
}

export enum CustomEventName {
  ConnectivityChange = 'connectivityChange',
  NavigateToError = 'navigateToError',
  WatchdogEvent = 'watchdogEvent',
}

export interface ConnectivityEventDetail {
  isOnline: boolean;
}

export interface WatchdogEventDetail {
  event: WatchdogEvent;
}

export interface NavigateToErrorEventDetail {
  path: string;
}
