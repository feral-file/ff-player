export enum KeyCodes {
  escape = 0x0010000001b,
  audioVolumeUp = 0x00100000a10,
}

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
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  JG_043_EXHIBITION_ID: 'a0d2f49b-2229-4c4d-88df-fff9c6e70981',
};
