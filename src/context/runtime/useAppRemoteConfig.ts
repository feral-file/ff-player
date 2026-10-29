import { AppSettings } from '@/constants';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { useEffect, useRef, useState } from 'react';
/** Retries uncached config on each online notification while retaining a published cache. */
export function useAppRemoteConfig(onlineSignal: number) {
  const [appRemoteConfig, setAppConfig] = useState({} as AppRemoteConfig);
  const remoteConfigService = useRef(new RemoteConfigService());
  useEffect(() => {
    // Generation guard. The old mount-once effect could not overlap; re-keying
    // it on `onlineSignal` means a slow read can still be in flight when the
    // next notification starts a fresh one, and the loser resolving last
    // would otherwise commit its (older, possibly fallback) config over the
    // winner's. The service refuses to hand back a fallback once a published
    // config is cached; this is the same protection one layer up, covering
    // the local-defaults branch below too. The guard deliberately does NOT
    // drop a superseded run whose result is the service's immutable cache —
    // see the carve-out below.
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const appRemoteConfig =
          await remoteConfigService.current.getAppRemoteConfig();
        // A cancelled run still commits when its result IS the immutable
        // cache (`cancelled` also flips on unmount, where the late setState
        // is a React no-op). The cancel guard exists so an older run cannot
        // overwrite a newer commit with staler data — but once a remote
        // read has landed, every run resolves to the same page-lifetime
        // object, so there is nothing staler to hand over. Dropping those
        // commits loses a real
        // recovery: on a flapping link an older read can succeed AFTER the
        // newer generation already failed over to local defaults, and with
        // no further online notification due, nothing else would ever
        // publish the cached result — the wall would stay on the built-in
        // default with the published config stranded in the cache.
        if (
          cancelled &&
          appRemoteConfig !== remoteConfigService.current.getCachedConfig()
        ) {
          return;
        }
        setAppConfig(appRemoteConfig);
      } catch (error) {
        console.log('[API] Failed to load config:', error);
        if (cancelled) {
          return;
        }
        setAppConfig({
          duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
          defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
          showRenderLoadingOverlay: true,
        });
      }
    };

    fetchConfig().catch((error: unknown) => {
      console.log('[API] Failed to load config:', error);
    });
    // Re-keyed on every online notification, which is what makes
    // RemoteConfigService's "don't cache a fallback" rule load-bearing: an
    // offline boot resolves to the LOCAL defaults, and without a second
    // caller the published display.json would never be read for the rest of
    // the page lifetime — the device would keep playing the built-in default
    // playlist even after Wi-Fi came up. Repeats are free once a real fetch
    // succeeds: the service caches that result and answers without a
    // request.
    return () => {
      cancelled = true;
    };
  }, [onlineSignal]);
  return appRemoteConfig;
}
