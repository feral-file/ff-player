export enum KeyCodes {
  escape = 0x0010000001b,
  audioVolumeUp = 0x00100000a10,
  audioVolumeDown = 0x00100000a0f,
  audioVolumeMute = 0x00100000a11,
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
}

export const IgnoreKeyDown = [
  KeyDown.audioVolumeDown,
  KeyDown.audioVolumeUp,
  KeyDown.audioVolumeMute,
  KeyDown.back,
];

export enum LocalStorageItem {
  deviceId = 'deviceId',
  locationID = 'locationID',
  topicID = 'topicID',
  platform = 'platform',
  castInfo = 'castInfo',
  name = 'device_name',
  branchLink = 'branchLink',
  previouslyConnectedDeviceIds = 'previouslyConnectedDeviceIds',
}

export enum Platform {
  android = 'android',
  tizen = 'tizen',
  lg = 'lg',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  JG_043_EXHIBITION_ID: '46a0f68b-a657-4364-92a0-32a88b65fbd9',
  STANDARD_HEIGHT: 1080,
};
