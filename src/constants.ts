export enum LocalStorageItem {
  deviceId = 'device_id',
  platform = 'platform',
  castInfo = 'castInfo',
  name = 'device_name',
  metricEvents = 'metricEvents',
  primaryAddress = 'primaryAddress',
  displaySettings = 'displaySettings',
  viewMode = 'viewMode',
}

export enum Platform {
  ffDevice = 'ff-device',
}

export enum DeviceNamePrefix {
  ffDevice = 'FF-X1-',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  DEFAULT_NEW_DAILY_HOUR: 6, // 6:00 AM
  JG_043_EXHIBITION_ID: '46a0f68b-a657-4364-92a0-32a88b65fbd9',
  EF_046_EXHIBITION_ID: '796f9fd9-d405-451c-a584-d9f21222c6dd',
  STANDARD_HEIGHT: 1080,
};

export const TIMESTAMP_PER_MINUTE = 60 * 1000;
export const TIMESTAMP_PER_HOUR = 60 * 60 * 1000;

export const NO_YEAR_IN_TITLE_SERIES_IDS = [
  // test
  'd0167047-8c50-4f24-b889-58e60258f50b',
  '76e78573-2703-497b-bd3b-0e7737efa697',
  // live
  '4e7c1eba-7c17-4c38-9454-36c72ae98249',
  '0b95013a-599b-4af2-a0a4-fe13eff98e89',
];

export const CLIENT_BANDWIDTH_HINT = 16; // Mbps

export const SWITCH_TOKEN_INTERVAL = 15 * 60 * 1000;

export const SOURCE_EXHIBITION_ID = 'source';
export const DEFAULT_DELAY = 24 * 60 * 60 * 1000;
export const LEE_MULLICAN_EXHIBITION_CONTRACT =
  'KT1CtDPiLjHiU1LVLrhshDry8jkR9h29tXNo';

// Network error
export const NETWORK_ERROR_MESSAGE = 'Network error';
export const NETWORK_ERROR_RETRY_COUNT = 3;
export const NETWORK_ERROR_RETRY_DELAY = 1000;
