export enum FlutterKeyEventID {
  escape = 0x0010000001b,
  goBack = 4294971397,
  enter = 0x0010000000d,
  select = 4294968588,
  arrowDown = 0x00100000301,
  arrowLeft = 0x00100000302,
  arrowRight = 0x00100000303,
  arrowUp = 0x00100000304,
}

export enum KeyboardEventKey {
  Escape = 'Escape',
  ArrowUp = 'ArrowUp',
  ArrowLeft = 'ArrowLeft',
  ArrowRight = 'ArrowRight',
  ArrowDown = 'ArrowDown',
  Enter = 'Enter',
  Unidentified = 'Unidentified',
}

export enum LocalStorageItem {
  deviceId = 'device_id',
  locationID = 'locationID',
  topicID = 'topicID',
  platform = 'platform',
  castInfo = 'castInfo',
  name = 'device_name',
  branchLink = 'branchLink',
  metricEvents = 'metricEvents',
  primaryAddress = 'primaryAddress',
  orientation = 'orientation',
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
  DEFAULT_NEW_DAILY_HOUR: 6, // 6:00 AM
  JG_043_EXHIBITION_ID: '46a0f68b-a657-4364-92a0-32a88b65fbd9',
  STANDARD_HEIGHT: 1080,
};

export const TIMESTAMP_PER_MINUTE = 60 * 1000;
export const TIMESTAMP_PER_HOUR = 60 * 60 * 1000;

export const PUSH_METRIC_INTERVAL = 60 * 1000;

export const SEND_LOG_INTERVAL = 10 * 1000;

export const SEND_LOG_EVENT_NUMBER = 4;
