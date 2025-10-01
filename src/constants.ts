export enum LocalStorageItem {
  deviceId = 'device_id',
  castInfo = 'castInfo',
  name = 'device_name',
  metricEvents = 'metricEvents',
  displaySettings = 'displaySettings',
  viewMode = 'viewMode',
  criticalTemp = 'criticalTemp',
  dp1ScheduledTask = 'dp1_scheduled_tasks',
}

export enum Platform {
  ffDevice = 'ff-device',
}

export enum DeviceNamePrefix {
  ffDevice = 'FF1-',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  STANDARD_HEIGHT: 1080,
};

export const CLIENT_BANDWIDTH_HINT = 16; // Mbps

export const LEE_MULLICAN_EXHIBITION_CONTRACT =
  'KT1CtDPiLjHiU1LVLrhshDry8jkR9h29tXNo';

// Network error
export const NETWORK_ERROR_MESSAGE = 'Network error';
export const NETWORK_ERROR_RETRY_COUNT = 3;
export const NETWORK_ERROR_RETRY_DELAY = 1000;
export const DEFAULT_PLAYLIST_URL =
  'https://dp1-feed-operator-api-prod.autonomy-system.workers.dev/api/v1/playlists/503e271c-7d96-4d80-ae10-ae2ba658d535';
