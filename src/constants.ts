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
  // The playlist remote-config display.json serves, for when display.json is
  // unreachable or names none.
  // Never a host outside Feral File's own zones: the former default named a
  // deleted autonomy-system.workers.dev worker.
  DEFAULT_PLAYLIST_URL:
    'https://feed.feralfile.com/api/v1/playlists/1bbefbc9-0226-439a-921b-12c6cf6a809e',
};

export const CLIENT_BANDWIDTH_HINT = 16; // Mbps

export const NO_DURATION_VALUE = 999999999;
