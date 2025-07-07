export enum ViewMode {
  portrait = 'portrait',
  landscape = 'landscape',
}

export enum MessageModalType {
  error = 'error',
  warning = 'warning',
  info = 'info',
}

export enum ArtFraming {
  FitToScreen = 'fit',
  CropToFill = 'fill',
}

export enum DisplayOrientation {
  Landscape = 'landscape',
  Portrait = 'portrait',
  LandscapeReverse = 'landscapeReverse',
  PortraitReverse = 'portraitReverse',
}

export interface TokenMetadata {
  name: string;
  artwork_id: string;
  image: string;
  animation_url: string;
}

export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
}

export interface WatchdogEventDetail {
  event: WatchdogEvent;
}
