import { WatchdogEvent } from './common.model';

export interface ConnectivityEventDetail {
  isOnline: boolean;
}

export interface WatchdogEventDetail {
  event: WatchdogEvent;
}
