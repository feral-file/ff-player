export enum LocalStorageItem {
  castInfo = 'castInfo',
  displaySettings = 'displaySettings',
  viewMode = 'viewMode',
  criticalTemp = 'criticalTemp',
  dp1ScheduledTask = 'dp1_scheduled_tasks',
  bootPlaylist = 'boot_playlist',
  versionUpdateReload = 'versionUpdateReload',
  defaultItemDuration = 'defaultItemDuration',
}

export const AppSettings = {
  VERSION_CHECK_INTERVAL_DURATION: 1000 * 60 * 60,
  STANDARD_HEIGHT: 1080,
  DEFAULT_PLAYLIST_URL:
    'https://dp1-feed-operator-api-prod.autonomy-system.workers.dev/api/v1/playlists/503e271c-7d96-4d80-ae10-ae2ba658d535',
};

export const CLIENT_BANDWIDTH_HINT = 16; // Mbps

export const NO_DURATION_VALUE = 999999999;

export const KNOWN_ORIGINS = new Set([
  'https://feralfile.com',
  'https://cdn.feralfileassets.com',
  'https://ipfs.io',
  'https://imagedelivery.net',
]);
