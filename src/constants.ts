export enum LocalStorageItem {
  castInfo = 'castInfo',
  displaySettings = 'displaySettings',
  viewMode = 'viewMode',
  criticalTemp = 'criticalTemp',
  dp1ScheduledTask = 'dp1_scheduled_tasks',
  // Holds a BootPlaylistRecord: the signed DP-1 document plus the unsigned
  // context it was cast under, in one value so a partial write cannot pair a
  // playlist with the wrong origin. A bare DP-1 document here is a pre-policy
  // record and reads as curated.
  bootPlaylist = 'boot_playlist',
  versionUpdateReload = 'versionUpdateReload',
  defaultItemDuration = 'defaultItemDuration',
  // Bounded device-local evidence of artworks that reached the viewer's
  // visual commit boundary. This is deliberately independent from castInfo:
  // castInfo is recovery state for one current cast, not a playback timeline.
  recentlyPlayed = 'recentlyPlayed',
  recentlyPlayedIncomplete = 'recentlyPlayedIncomplete',
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
  'https://cdn.artworks.feralfile.io',
  'https://ipfs.io',
  'https://imagedelivery.net',
]);
