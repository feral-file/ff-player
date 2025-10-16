export enum LocalStorageItem {
  castInfo = 'castInfo',
  displaySettings = 'displaySettings',
  viewMode = 'viewMode',
  criticalTemp = 'criticalTemp',
  dp1ScheduledTask = 'dp1_scheduled_tasks',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60, // 1 minutes
  STANDARD_HEIGHT: 1080,
};

export const CLIENT_BANDWIDTH_HINT = 16; // Mbps

export const LEE_MULLICAN_EXHIBITION_CONTRACT =
  'KT1CtDPiLjHiU1LVLrhshDry8jkR9h29tXNo';

export const NO_DURATION_VALUE = 999999999;

// Network error
export const NETWORK_ERROR_MESSAGE = 'Network error';
export const NETWORK_ERROR_RETRY_COUNT = 3;
export const NETWORK_ERROR_RETRY_DELAY = 1000;
export const DEFAULT_PLAYLIST_URL =
  'https://dp1-feed-operator-api-prod.autonomy-system.workers.dev/api/v1/playlists/0f7a3583-6c45-4e77-a2de-a39efe4fa731';
