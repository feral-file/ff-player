export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
  ServiceFailed = 'ServiceFailed',
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
