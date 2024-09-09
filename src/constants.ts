export enum KeyCodes {
  escape = 0x0010000001b,
  goBack = 4294971397,
  audioVolumeUp = 0x00100000a10,
  audioVolumeDown = 0x00100000a0f,
  audioVolumeMute = 0x00100000a11,
  enter = 0x0010000000d,
  select = 4294968588,
}

export const IgnoreKeyCodes = [
  KeyCodes.escape,
  KeyCodes.audioVolumeUp,
  KeyCodes.audioVolumeDown,
  KeyCodes.audioVolumeMute,
];

export enum KeyDown {
  audioVolumeDown = 'AudioVolumeDown',
  audioVolumeUp = 'AudioVolumeUp',
  audioVolumeMute = 'AudioVolumeMute',
  back = 'Back',
  arrowUp = 'ArrowUp',
  arrowLeft = 'ArrowLeft',
  arrowRight = 'ArrowRight',
  arrowDown = 'ArrowDown',
  enter = 'Enter',
  unidentified = 'Unidentified',
}

export const IgnoreKeyDown = [
  KeyDown.audioVolumeDown,
  KeyDown.audioVolumeUp,
  KeyDown.audioVolumeMute,
  KeyDown.back,
  KeyDown.arrowUp,
  KeyDown.arrowLeft,
  KeyDown.arrowRight,
  KeyDown.arrowDown,
  KeyDown.enter,
  KeyDown.unidentified,
];

export enum LocalStorageItem {
  deviceId = 'device_id',
  locationID = 'locationID',
  topicID = 'topicID',
  platform = 'platform',
  castInfo = 'castInfo',
  name = 'device_name',
  branchLink = 'branchLink',
  previouslyConnectedDeviceIds = 'previouslyConnectedDeviceIds',
  metricIdentifier = 'metricIdentifier',
}

export enum Platform {
  google = 'google',
  tizen = 'tizen',
  lg = 'lg',
}

export enum DeviceNamePrefix {
  google = 'Google-',
  samsung = 'Samsung-',
  lg = 'LG-',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  JG_043_EXHIBITION_ID: '46a0f68b-a657-4364-92a0-32a88b65fbd9',
  STANDARD_HEIGHT: 1080,
};

export const TIME_PER_HOUR = 60 * 60 * 1000;

export const MetricDuration = 18 * 1000;
