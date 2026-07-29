'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import useNetworkManger from '@/services/custom-hooks/useNetworkManager';
import useDeviceRotation, {
  DeviceRotation,
} from '@/services/custom-hooks/useDeviceRotation';
import RemoteConfigService, {
  AppRemoteConfig,
} from '@/services/remoteConfigService';
import { AppSettings, LocalStorageItem } from '@/constants';
import DeviceManager from '@/utils/DeviceManager';
import useCastInfo from '@/services/custom-hooks/useCastInfo';
import { CastInfo, CastCommand } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { useDeviceSettings } from '@/services/custom-hooks/useDeviceSettings';
import { DisplaySettings } from '@/models/display_settings.model';
import { CDPRequestHandler } from '@/services/cdp-handler/CDPRequestHandler';
import useCursorPositions, {
  CursorPosition,
} from '@/services/custom-hooks/useCursorPositions';
import {
  ConnectivityEventDetail,
  CustomEventName,
} from '@/models/custom_event';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { stripLegacyCastPlaybackTimeline } from '@/utils/castInfo';
import { useRouter } from 'next/navigation';

interface AppContextProps {
  children: ReactNode;
}

interface AppContextValue {
  context: AppConfigContext;
}

interface AppConfigContext {
  isInitialized: boolean;
  isOnline: boolean;
  deviceRotation?: DeviceRotation;
  appRemoteConfig: AppRemoteConfig;
  castInfo: CastInfo | null;
  displaySettings: DisplaySettings | null;
  cursorPositions: CursorPosition[] | null;
  /**
   * True while the artwork the player is currently trying to show failed to
   * load. Owned by ArtworkPlayer (only it can tell a genuine load from a
   * failure) and lifted here because two unrelated consumers need it: the
   * reconnect-recovery effect below, and SetupArtworkBackground, which shows
   * the bundled offline artwork instead of a black screen.
   */
  playbackDegraded: boolean;
  /**
   * Reports the load outcome of the current artwork. AppProvider always
   * supplies it. It is optional so ArtworkPlayer can call it defensively:
   * the player is mounted in several suites against a hand-built context
   * value cast with `as never`, where the setter is absent at runtime no
   * matter what this type says, and a required signature would only hide
   * that behind a `TypeError`.
   */
  setPlaybackDegraded?: (degraded: boolean) => void;
}

/**
 * Backoff for the boot fallback-playlist retry loop. Short enough that a
 * transient fetch hiccup recovers quickly, capped so a genuinely offline
 * device (setup not finished yet) polls gently until the `isOnline` re-key
 * fires a fresh attempt anyway.
 */
const FALLBACK_PLAYLIST_RETRY_INITIAL_MS = 5_000;
const FALLBACK_PLAYLIST_RETRY_MAX_MS = 60_000;

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within a AppProvider');
  }

  return context;
};

/* eslint-disable max-lines-per-function -- single provider owns boot + subscriptions */
export const AppProvider = ({ children }: AppContextProps) => {
  const [appRemoteConfig, setAppConfig] = useState({} as AppRemoteConfig);
  const remoteConfigService = useRef(new RemoteConfigService());
  const [isInitialized, setIsInitialized] = useState(false);
  // Fallback-playlist request state. `active` drives the retry loop below;
  // `nonce` distinguishes repeated requests so an explicit
  // displayDefaultPlaylist command restarts the loop (fresh backoff,
  // immediate attempt) even when a run is already active or just finished.
  // One state object so a request is a single update — never an intermediate
  // render where only half the request has landed.
  const [fallbackRequest, setFallbackRequest] = useState({
    active: false,
    nonce: 0,
  });
  // Synchronous mirror of "an explicit cast landed after the current
  // fallback request was armed". The ExplicitPlaylistCast handler also clears
  // `active` via setState, but that only reaches the in-flight attempt when
  // React re-runs the effect cleanup — a default-playlist fetch resolving
  // before that flush would still commit over the explicit cast. The ref
  // flips inside the event handler itself, so `shouldAbort` sees the
  // cancellation in the same task with no dependence on React scheduling.
  // Re-arming a request resets it, preserving explicit-then-default ordering.
  const explicitCastSinceRequestRef = useRef(false);
  const requestFallbackPlaylist = useCallback(() => {
    explicitCastSinceRequestRef.current = false;
    setFallbackRequest(prev => ({ active: true, nonce: prev.nonce + 1 }));
  }, []);
  // Counts every "online" connectivity NOTIFICATION, not the derived
  // isOnline boolean. useNetworkManger starts at `true`, so on an offline
  // SoftAP boot the first ConnectivityChange({isOnline: true}) is a
  // true→true no-op that never re-keys the fallback effect — the device
  // would sit out the 5–60s backoff instead of retrying the moment
  // provisioning lands. A counter re-keys on the notification itself, so
  // even a repeated `true` restarts the loop (harmless when idle: the
  // effect early-returns unless a request is active).
  const [onlineSignal, setOnlineSignal] = useState(0);

  // "The artwork on screen failed to load", reported by ArtworkPlayer.
  const [playbackDegraded, setPlaybackDegraded] = useState(false);

  const { castInfo, setCastInfo } = useCastInfo();
  const { displaySettings, setDisplaySettings } = useDeviceSettings();
  const { cursorPositions } = useCursorPositions();
  const router = useRouter();
  const isOnline = useNetworkManger();
  const isFirstRender = useRef(true);

  const deviceRotation = useDeviceRotation();

  const initContext = async () => {
    try {
      await initDeviceConfigService();
      setIsInitialized(true);
    } catch (error) {
      console.log('Error init context', error);
    }
  };

  const initDeviceConfigService = async () => {
    try {
      console.log('[AppContext] initDeviceConfigService');
      await initialDisplaySettings();
      await initCastInfo();
    } catch (error) {
      console.log('Error init device manager', error);
    } finally {
      // Ends CanvasService's hydration gate on EVERY path (restored, fallen
      // back, castDaily/critical-temp, or thrown): a deferred
      // onlyIfNoPlaylist push re-evaluates now that castInfo is
      // authoritative. A stuck-open gate would silently drop claim-time
      // pushes forever, so this must not depend on initCastInfo succeeding.
      canvasService.completeBootCastHydration();
    }
  };

  const initialDisplaySettings = async () => {
    console.log('[AppContext] initialDisplaySettings');
    const displaySettings = await DeviceManager.getDeviceDisplaySettings();
    if (displaySettings) {
      setDisplaySettings(displaySettings);
    }
  };

  const navigateToHomePage = () => {
    if (window.location.pathname !== '/') {
      console.log('navigate to home page');
      router.push('/');
    }
  };

  const initCastInfo = async () => {
    console.log('[AppContext] initCastInfo');

    let castInfo: CastInfo | null = null;

    // Check if this is a version update reload
    const versionUpdateReloadValue = await DeviceManager.getItem(
      LocalStorageItem.versionUpdateReload
    );
    const isVersionUpdateReload = versionUpdateReloadValue === 'true';

    if (isVersionUpdateReload) {
      console.log(
        '[AppContext] Version update reload detected, skipping boot playlist'
      );
      await DeviceManager.removeItem(LocalStorageItem.versionUpdateReload);
    }

    if (!isVersionUpdateReload) {
      const bootPlaylist = await DeviceManager.getBootPlaylist();
      if (bootPlaylist?.items?.length) {
        console.log('[AppContext] Boot playlist found, casting boot playlist');
        castInfo = {
          castCommand: CastCommand.displayPlaylist,
          playlist: bootPlaylist,
          index: 0,
          isPaused: false,
          playlistId: bootPlaylist.id,
        };
      }
    }

    castInfo ??= await DeviceManager.getCastInfo();

    const criticalTempValue = castInfo
      ? await DeviceManager.getItem(LocalStorageItem.criticalTemp)
      : null;

    // A live cast command can commit while the storage reads above are in
    // flight: the CDP entry point is up before hydration finishes, so a
    // forced displayDefaultPlaylist (OOM-recovery reload) or an explicit
    // cast can already be on screen by now. Everything read from storage is
    // by definition staler than a live command, so acting on it — restoring
    // castInfo over a just-cast forced default, or arming the fallback from
    // a stale castDaily/critical-temp marker — would overwrite content the
    // controller just chose. Boot's job (ensure something is playing) is
    // already done; bail out. One-shot markers need no cleanup here: any
    // live displayPlaylist/displayDefaultPlaylist command already cleared
    // criticalTemp in CanvasService's commandHandler. Everything below this
    // check is synchronous, so no further command can interleave before the
    // boot decision applies.
    if (canvasService.getCastInfo()) {
      console.log(
        '[AppContext] Live cast committed during hydration, skipping boot cast state'
      );
      return;
    }

    if (castInfo) {
      if (criticalTempValue === 'true') {
        // Fetch and cast default playlist after critical temp reset.
        requestFallbackPlaylist();
        // Fire-and-forget (same idiom as CanvasService's commandHandler):
        // awaiting here would reopen an interleaving window after the
        // live-cast check above.
        DeviceManager.removeItem(LocalStorageItem.criticalTemp).catch(
          (error: unknown) => {
            console.error('[AppContext] Error removing criticalTemp:', error);
          }
        );
        return;
      }

      if (castInfo.castCommand?.toString() === 'castDaily') {
        requestFallbackPlaylist();
        return;
      }

      if (castInfo.playlist?.items?.length && castInfo.index !== undefined) {
        const normalizedIndex = normalizePlaylistIndex(
          castInfo.index,
          castInfo.playlist.items.length
        );
        if (normalizedIndex !== castInfo.index) {
          castInfo = {
            ...castInfo,
            index: normalizedIndex,
          };
        }
      }

      const cleanCastInfo = stripLegacyCastPlaybackTimeline(castInfo);
      setCastInfo(cleanCastInfo);
      canvasService.setCastInfo(cleanCastInfo, false);
      navigateToHomePage();
    } else {
      // Cast default playlist
      console.log('[AppContext] No castInfo found, fetching default playlist');
      requestFallbackPlaylist();
    }
  };


  useEffect(() => {
    // Generation guard. The old mount-once effect could not overlap; re-keying
    // it on `onlineSignal` means a slow read can still be in flight when the
    // next notification starts a fresh one, and the loser resolving last
    // would otherwise commit its (older, possibly fallback) config over the
    // winner's. The service refuses to hand back a fallback once a published
    // config is cached; this is the same protection one layer up, covering
    // the local-defaults branch below too.
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const appRemoteConfig =
          await remoteConfigService.current.getAppRemoteConfig();
        if (cancelled) {
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

  useEffect(() => {
    const cdpRequestHandler = CDPRequestHandler.getInstance();
    cdpRequestHandler.initialize();
    return () => {
      cdpRequestHandler.cleanup();
    };
  }, []);

  // Boot fallback playlist, retried until it actually casts.
  //
  // The kiosk boots straight into the player, so on first-time (SoftAP) setup
  // this page loads with NO connectivity: the historical one-shot fallback
  // fetch failed offline and nothing ever retried, leaving a freshly-paired
  // device with a running player and no artwork. (Before the setup-overlay
  // merge, setupd only navigated Chromium here after setup finished online,
  // which is what masked this.) Two recovery signals cooperate:
  //   - a capped exponential backoff, for the case where connectivity exists
  //     but the fetch fails transiently;
  //   - re-keying on `onlineSignal` (every online connectivity notification,
  //     not the derived boolean), so the moment Wi-Fi provisioning lands the
  //     next attempt fires immediately (art is ready behind the setup overlay
  //     before the claim even completes). The re-key also resets the backoff.
  // Success clears `fallbackRequest.active`, which ends the loop; a later
  // castDaily/critical-temp boot requests it again and re-arms this effect.
  // An explicit cast landing mid-loop also ends it (ExplicitPlaylistCast
  // listener below): the fallback exists to guarantee SOMETHING is playing,
  // so once the controller casts real content, a lingering retry must not
  // replace it with the default playlist.
  //
  // This loop is also the ONLY resolver for the displayDefaultPlaylist CDP
  // command (claim-time push, OOM recovery): CanvasService dispatches
  // DisplayDefaultPlaylist instead of fetching remote config itself, so the
  // pushed playlist and the player's own pull can never disagree on the URL.
  // The request nonce restarts the loop so those requests fire immediately.
  useEffect(() => {
    if (!(appRemoteConfig.defaultPlaylistURL && fallbackRequest.active)) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelayMs = FALLBACK_PLAYLIST_RETRY_INITIAL_MS;

    const attempt = async () => {
      console.log('[AppContext] Fallback default playlist attempt');
      // The hook lets CanvasService drop the cast between its fetch
      // resolving and the commit: an explicit cast can land while the fetch
      // is in flight, and the `cancelled` check below runs only after the
      // commit already happened inside castPlaylistByURL. The ref is the
      // synchronous half — `cancelled` alone flips only when React runs this
      // effect's cleanup, which can be after the fetch resolves.
      const casted = await canvasService.castPlaylistByURL(
        appRemoteConfig.defaultPlaylistURL,
        () => cancelled || explicitCastSinceRequestRef.current
      );
      if (cancelled) {
        return;
      }
      if (casted) {
        // Only settle the request THIS run was started for. A new request can
        // land while the cast is in flight, and React may batch its
        // {active:true, nonce+1} update into the same commit as this
        // clear — an unguarded clear would swallow that request before its
        // effect run ever fires.
        setFallbackRequest(prev =>
          prev.nonce === fallbackRequest.nonce
            ? { ...prev, active: false }
            : prev
        );
        if (window.location.pathname !== '/') {
          router.push('/');
        }
        return;
      }
      console.log(
        '[AppContext] Fallback playlist failed, retrying in ms:',
        retryDelayMs
      );
      retryTimer = setTimeout(() => void attempt(), retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, FALLBACK_PLAYLIST_RETRY_MAX_MS);
    };

    void attempt();
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [appRemoteConfig.defaultPlaylistURL, fallbackRequest, onlineSignal, router]);

  // Feed `onlineSignal` from the raw ConnectivityChange event stream (see the
  // declaration comment for why the isOnline boolean is not enough).
  useEffect(() => {
    const handleConnectivityChange = (event: Event) => {
      const detail = (event as CustomEvent<ConnectivityEventDetail>).detail;
      if (detail.isOnline) {
        setOnlineSignal(prev => prev + 1);
      }
    };
    window.addEventListener(
      CustomEventName.ConnectivityChange,
      handleConnectivityChange
    );
    return () => {
      window.removeEventListener(
        CustomEventName.ConnectivityChange,
        handleConnectivityChange
      );
    };
  }, []);

  // Reconnect recovery for an artwork that failed to load.
  //
  // On an offline boot the persisted castInfo playlist restores from
  // IndexedDB, but every remote asset fetch behind it is single-attempt: a
  // failure commits the empty slot through the crossfade (black screen) or
  // leaves an iframe on Chromium's error page, and nothing ever retried once
  // connectivity returned. This is that retry.
  //
  // Two edges trigger it, and between them they cover both orderings of the
  // race between "Wi-Fi came back" and "the fetch finally gave up":
  //   - `onlineSignal`, for a load that had already failed when connectivity
  //     returned. It counts online NOTIFICATIONS rather than reading the
  //     isOnline boolean for the same reason the fallback loop above does
  //     (see its declaration comment): useNetworkManger starts at `true`, so
  //     the first real ConnectivityChange after provisioning is a true→true
  //     no-op that would never re-key an isOnline-keyed effect.
  //   - `playbackDegraded` itself, for a load still in flight when that
  //     notification arrived and only erroring seconds later — on a
  //     single-item playlist there is no playlist advance to retry it, so
  //     without this edge the wall stays black indefinitely.
  //
  // This cannot become a retry loop, which is why it needs no attempt cap:
  // the refresh re-mounts the SAME previewURL, so a repeat failure finds the
  // flag already set, ArtworkPlayer writes no new context state, and neither
  // dependency changes. Recovery is bounded to one nudge per genuine
  // transition rather than a timer hammering a URL connectivity cannot fix.
  //
  // Firing regardless of `isOnline` is DELIBERATE: that boolean is only as
  // good as the daemon's edge-triggered pushes (see DEVICE_LOCAL_PLAYER.md),
  // so gating on it would make recovery exactly as unreliable as the
  // best-effort backdrop. The cost of not gating is one bounded extra reload
  // per item visit for a genuinely broken artwork.
  useEffect(() => {
    if (!playbackDegraded) {
      return;
    }
    console.log('[AppContext] Degraded playback, refreshing artwork');
    canvasService.requestArtworkRefresh();
  }, [onlineSignal, playbackDegraded]);

  // Explicit (non-fallback) cast committed → cancel any active fallback
  // request so a pending retry or in-flight attempt can never overwrite the
  // controller's content with the default playlist. Ordering with a
  // concurrent displayDefaultPlaylist request is inherent: both signals are
  // synchronous window events, so whichever command arrived last wins —
  // explicit-then-default stays active (forced default retained),
  // default-then-explicit ends up cancelled (explicit cast wins).
  useEffect(() => {
    const handleExplicitCast = () => {
      // Ref first: it must be visible to an in-flight attempt's shouldAbort
      // in this same task; the state update below only stops FUTURE effect
      // runs and clears the armed retry timer once React flushes.
      explicitCastSinceRequestRef.current = true;
      setFallbackRequest(prev =>
        prev.active ? { ...prev, active: false } : prev
      );
    };
    window.addEventListener(
      CustomEventName.ExplicitPlaylistCast,
      handleExplicitCast
    );
    return () => {
      window.removeEventListener(
        CustomEventName.ExplicitPlaylistCast,
        handleExplicitCast
      );
    };
  }, []);

  // displayDefaultPlaylist command → re-enter the fallback flow above. The
  // conditional (onlyIfNoPlaylist) no-op already happened in CanvasService;
  // any event that reaches here is an unconditional "cast the default now".
  useEffect(() => {
    const handleDefaultPlaylistRequest = () => {
      console.log('[AppContext] displayDefaultPlaylist requested');
      requestFallbackPlaylist();
    };
    window.addEventListener(
      CustomEventName.DisplayDefaultPlaylist,
      handleDefaultPlaylistRequest
    );
    return () => {
      window.removeEventListener(
        CustomEventName.DisplayDefaultPlaylist,
        handleDefaultPlaylistRequest
      );
    };
  }, [requestFallbackPlaylist]);

  useEffect(() => {
    initContext().catch((error: unknown) => {
      console.error('[AppContext] Error initializing context:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot boot
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isOnline) {
      DeviceManager.getCastInfo()
        .then((castInfo: CastInfo | null) => {
          if (castInfo) {
            // TODO: Send cast info to app
          }
        })
        .catch((error: unknown) => {
          console.error('[AppContext] Error getting cast info:', error);
        });
    }
  }, [isOnline]);

  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized,
          isOnline,
          deviceRotation,
          appRemoteConfig,
          castInfo,
          displaySettings,
          cursorPositions,
          playbackDegraded,
          setPlaybackDegraded,
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
