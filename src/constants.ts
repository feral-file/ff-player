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

// Playback watchdog (feral-file/ff-app#520, Layers C+D). The advance timer and
// source-end events cannot recover an item that has no duration timer armed and
// never emits an `ended` event — a stuck load or an unrecoverable render failure
// parks the device on that slot forever. These bounds drive `useRenderWatchdog`,
// which force-advances such a slot. They deliberately apply ONLY to items with
// no resolvable duration (has-duration items keep the duration timer as their
// backstop), so a healthy work is never cut short.
//
// Grace for a slot to reach `ready`/`failed` before it is treated as a stuck
// load and force-advanced. Generous so a slow-but-legit generative bundle over
// a slow link is never cut mid-load.
export const RENDER_WATCHDOG_LOAD_TIMEOUT_MS = 45_000;

// Grace after an unrecoverable `failed` before force-advancing a no-duration
// slot. Long enough to let the render layer's own recovery (e.g. an iframe
// reload) re-reach `ready` and cancel the advance.
export const RENDER_WATCHDOG_FAILURE_GRACE_MS = 5_000;

export const KNOWN_ORIGINS = new Set([
  'https://feralfile.com',
  'https://cdn.feralfileassets.com',
  'https://ipfs.io',
  'https://imagedelivery.net',
]);
