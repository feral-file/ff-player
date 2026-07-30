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
   *
   * `url` is the artwork ArtworkPlayer was actually reporting on (present
   * whenever `degraded` is true; omitted or ignored on a clear). AppContext
   * keys the M7 per-URL refresh budget off it — see the reconnect-recovery
   * effect below.
   */
  setPlaybackDegraded?: (degraded: boolean, url?: string) => void;
}

/**
 * Backoff for the boot fallback-playlist retry loop. Short enough that a
 * transient fetch hiccup recovers quickly, capped so a genuinely offline
 * device (setup not finished yet) polls gently until the `isOnline` re-key
 * fires a fresh attempt anyway.
 */
const FALLBACK_PLAYLIST_RETRY_INITIAL_MS = 5_000;
const FALLBACK_PLAYLIST_RETRY_MAX_MS = 60_000;

/**
 * M7 damping, Layer 2 (cross-repo recovery design §4.4): bounds how many
 * reconnect-recovery refreshes a single degraded URL can consume. Layer 1
 * (ArtworkPlayer) stops a flapping video/audio mount from self-clearing
 * after a failure; this layer bounds the sibling loop path — a URL that
 * stays continuously degraded while every online notification re-triggers
 * the effect below (`playbackDegraded` itself only toggles once per genuine
 * transition, so a sustained failure cannot re-arm the effect on its own).
 */
const REFRESH_BUDGET_MAX_ATTEMPTS = 3;
const REFRESH_BUDGET_BACKOFF_MS = [15_000, 60_000, 240_000];
const REFRESH_BUDGET_SETTLE_MS = 60_000;
const REFRESH_BUDGET_MAX_AGE_MS = 10 * 60_000;

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
  // URL of the last SUCCESSFUL fallback cast, null once an explicit cast
  // replaces that content or the controller stops playback (disconnect /
  // sleep). This is what lets a config change supersede a
  // stale fallback: the retry loop and the display.json refetch both re-key
  // on the same online notification, so a still-armed request can cast the
  // stale (typically built-in default) URL, succeed, and clear itself before
  // the published defaultPlaylistURL lands — and a successful cast can also
  // outrun the refetch entirely when the playlist host is reachable while
  // the config host is not. Either way the device would play the built-in
  // default for the rest of the page lifetime, which is exactly the
  // offline-boot bug the refetch exists to fix. The supersede effect below
  // re-arms the request when the config lands with a different URL, so the
  // wrong cast is a bounded transient instead of permanent. A ref, not
  // state: it changes inside async cast completions and event handlers, and
  // only the config-change effect ever needs to read it.
  const lastFallbackCastURLRef = useRef<string | null>(null);

  // "The artwork on screen failed to load", reported by ArtworkPlayer.
  const [playbackDegraded, setPlaybackDegradedState] = useState(false);
  // URL the current `playbackDegraded=true` report is about; null while
  // healthy. Read (never written) by the M7 refresh-budget effect below to
  // key and reset its per-URL attempt budget — ArtworkPlayer is the only
  // source of truth for "which artwork is failing," so the setter's second
  // argument carries it through rather than re-deriving it from castInfo
  // (playlist position, not the resolved previewURL the player requested).
  const degradedArtworkURLRef = useRef<string | null>(null);
  const setPlaybackDegraded = useCallback(
    (degraded: boolean, url?: string) => {
      degradedArtworkURLRef.current = degraded ? (url ?? null) : null;
      setPlaybackDegradedState(degraded);
    },
    []
  );

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
    // Tracks which of the two awaited calls threw, so the CDP status
    // probe's bootHydration can distinguish them: only an initCastInfo
    // failure means the page is genuinely wedged (§4.1 of the cross-repo
    // recovery design — that value feeds boot recovery's only destructive
    // row). An initialDisplaySettings failure is not fatal to playback and
    // must still report 'ok'.
    let bootHydrationOutcome: 'ok' | 'failed' = 'ok';
    try {
      console.log('[AppContext] initDeviceConfigService');
      // Isolated in its own try/catch: a settings-read failure must not
      // short-circuit initCastInfo below. Letting it propagate into the
      // outer try would skip the cast restore entirely while still
      // reporting bootHydrationOutcome 'ok' (only the inner catch below
      // sets 'failed') — controld would then classify a wall that never
      // restored its cast as a succeeded boot.
      try {
        await initialDisplaySettings();
      } catch (error) {
        console.log('Error init display settings', error);
      }
      try {
        await initCastInfo();
      } catch (error) {
        bootHydrationOutcome = 'failed';
        throw error;
      }
    } catch (error) {
      console.log('Error init device manager', error);
    } finally {
      // Ends CanvasService's hydration gate on EVERY path (restored, fallen
      // back, castDaily/critical-temp, or thrown): a deferred
      // onlyIfNoPlaylist push re-evaluates now that castInfo is
      // authoritative. A stuck-open gate would silently drop claim-time
      // pushes forever, so this must not depend on initCastInfo succeeding.
      canvasService.completeBootCastHydration(bootHydrationOutcome);
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
        // Persisted playlists are recovery snapshots, not incoming cast
        // commands: keep legacy state playable across upgrades and avoid
        // revalidating snapshots already accepted by newer versions. Source
        // validation belongs exclusively at CanvasService's live cast boundary.
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

    // CastInfo follows the same recovery contract as bootPlaylist above. A
    // stored snapshot must retain its original playback semantics; validating
    // again here would make an upgrade reject content that was already active.
    castInfo ??= await DeviceManager.getCastInfo();

    const criticalTempValue = castInfo
      ? await DeviceManager.getItem(LocalStorageItem.criticalTemp)
      : null;

    // A live command can take authority while the storage reads above are in
    // flight: the CDP entry point is up before hydration finishes, so a
    // forced displayDefaultPlaylist (OOM-recovery reload), an explicit
    // cast — or a disconnect — can already have decided the wall by now.
    // Everything read from storage is by definition staler than a live
    // command, so acting on it — restoring castInfo over a just-cast forced
    // default, or arming the fallback from a stale castDaily/critical-temp
    // marker — would overwrite what the controller just chose. A committed
    // cast shows in getCastInfo(); a deliberate stop (disconnect, sleep,
    // error navigation) leaves castInfo null and is visible only through
    // the hydration-halt flags (null alone cannot distinguish "stopped"
    // from "nothing happened").
    //
    // The halts are NOT all alike, though. Only a cast-CLEARING halt
    // (disconnect) may skip the restore entirely: the persisted playlist is
    // exactly the state the controller cleared. A preserving halt (sleep,
    // error navigation) leaves the persisted playlist valid — it is what a
    // later wake must find — so boot still restores it below, but ONLY into
    // CanvasService (the copy setSleepMode(false) reads on wake), never into
    // React state, and suppresses every fallback-arming branch (a successful
    // fallback cast navigates to '/' and would relight the stopped wall; a
    // wake with nothing playable re-arms via CanvasService's own
    // DisplayDefaultPlaylist re-entry instead). React state must stay
    // untouched because the halt's Navigate('/sleep' | '/error') was
    // dispatched while isInitialized was still false — the only Navigate
    // listener mounts inside InitializedAppWrapper, so the event was DROPPED
    // and the route is still '/'; a restored React castInfo would then drive
    // AppWrapper's cast effect to push('/playlist') the moment
    // isInitialized flips, relighting the wall the halt deliberately
    // stopped. Without the service-side restore, a sleep landing
    // mid-hydration would make the wake path find no playlist and cast —
    // and persist — the default over the user's content.
    //
    // One-shot markers need no cleanup on the cast branch: any live
    // displayPlaylist/displayDefaultPlaylist command already cleared
    // criticalTemp in CanvasService's commandHandler. A mid-hydration halt
    // leaves the marker set, benignly — the next boot re-evaluates it and
    // the ordinary removeItem self-clears when it fires. Everything below
    // this check is synchronous, so no further command can interleave
    // before the boot decision applies.
    const halted = canvasService.wasHaltedDuringBootHydration();
    if (
      canvasService.getCastInfo() ||
      (halted && canvasService.didHydrationHaltClearCast())
    ) {
      console.log(
        '[AppContext] Live command decided the wall during hydration, skipping boot cast state'
      );
      return;
    }

    if (castInfo) {
      if (criticalTempValue === 'true') {
        if (halted) {
          // Marker left in place: it is gated on persisted castInfo and
          // self-clears when it eventually fires.
          return;
        }
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
        if (halted) {
          // Nothing restorable behind the marker; a wake with nothing
          // playable re-enters the fallback via DisplayDefaultPlaylist.
          return;
        }
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
      canvasService.setCastInfo(cleanCastInfo, false);
      if (!halted) {
        setCastInfo(cleanCastInfo);
        navigateToHomePage();
      }
    } else if (!halted) {
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
  //
  // This loop deliberately races the display.json refetch keyed on the same
  // online notification rather than waiting for it: holding casts hostage to
  // a config read (10s timeout, re-cancelled by every further notification)
  // could leave the wall showing nothing at all, and something stale beats
  // nothing on a wall display. A cast that wins with a stale URL is instead
  // superseded by the config-change effect below once the published config
  // lands.
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
      if (casted) {
        // Record what the wall is now showing BEFORE the cancelled check
        // and regardless of the nonce guard below: even when a newer effect
        // run or request supersedes this one, the cast itself committed,
        // and the supersede effect compares against the content actually on
        // screen. (A superseding run that casts again overwrites this with
        // its own URL.)
        lastFallbackCastURLRef.current = appRemoteConfig.defaultPlaylistURL;
      }
      if (cancelled) {
        return;
      }
      if (casted) {
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

  // Supersede a stale fallback cast when the published config lands.
  //
  // The retry loop above and the display.json refetch re-key on the same
  // online notification, so a still-armed request can cast the stale
  // (built-in default) URL first, succeed, and clear itself — and a cast can
  // also outrun the refetch across notifications entirely (the playlist host
  // reachable, the config host not). Without this, the published
  // defaultPlaylistURL landing later finds no active request and the device
  // plays the built-in default for the page lifetime. Re-arming only when
  // the wall currently shows a fallback cast of a DIFFERENT URL keeps this
  // bounded: the page-lifetime config cache means the URL can change at most
  // once (local default → published), and an explicit cast or a controller
  // stop (disconnect / sleep) clears the ref (stand-down listener below), so
  // the controller's content is never replaced and a stopped wall is never
  // relit.
  //
  // Gated on `!fallbackRequest.active`: the retry-loop effect above already
  // has `appRemoteConfig.defaultPlaylistURL` in its own deps, so a request
  // that is still active (armed or in flight) picks up the same URL change
  // on its own re-key. Without this gate, a config change landing while a
  // request is still active fires BOTH effects in the same commit — the
  // re-keyed retry AND this one's fresh `requestFallbackPlaylist()` (a new
  // nonce) — and both end up casting the identical published URL back to
  // back. This effect's job is only to RE-ARM a request that already
  // settled on a stale URL, not to race one that is still in flight.
  useEffect(() => {
    const lastFallbackCastURL = lastFallbackCastURLRef.current;
    if (
      !fallbackRequest.active &&
      lastFallbackCastURL !== null &&
      appRemoteConfig.defaultPlaylistURL &&
      appRemoteConfig.defaultPlaylistURL !== lastFallbackCastURL
    ) {
      console.log('[AppContext] Config changed, superseding fallback cast');
      requestFallbackPlaylist();
    }
  }, [
    appRemoteConfig.defaultPlaylistURL,
    fallbackRequest.active,
    requestFallbackPlaylist,
  ]);

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
  // Firing regardless of `isOnline` is DELIBERATE: that boolean is only as
  // good as the daemon's edge-triggered pushes (see DEVICE_LOCAL_PLAYER.md),
  // so gating on it would make recovery exactly as unreliable as the
  // best-effort backdrop.
  //
  // M7 damping (§4.4 of the cross-repo recovery design): a single failing
  // URL cannot loop through `playbackDegraded` itself — Layer 1 in
  // ArtworkPlayer keeps a repeat failure on the SAME mount from re-clearing
  // and re-raising the flag, and the refresh re-mounts the SAME previewURL,
  // so a repeat failure there finds the flag already set and writes no new
  // context state. But `onlineSignal` alone can still re-trigger THIS effect
  // indefinitely while degraded stays continuously true (a flapping link
  // pushing repeated online notifications), which the old "cannot loop"
  // reasoning did not account for. Layer 2 bounds that path: at most
  // REFRESH_BUDGET_MAX_ATTEMPTS refreshes per degraded URL, gated by an
  // escalating backoff between attempts. The budget resets — granting a
  // fresh set of attempts — on any of: a different URL becoming degraded,
  // a genuine online edge (`isOnline` false→true, not a repeated
  // notification — onlineSignal's repeats are exactly what this budget
  // exists to bound), a 60s clear settle after a refresh (the artwork
  // recovered and stayed up), or REFRESH_BUDGET_MAX_AGE_MS of continuous
  // elapsed time (a safety valve so a URL that never settles is not capped
  // forever).
  //
  // Backoff is the PRIMARY re-entry trigger, not a passive gate (§1
  // principle 3): the effect's own deps (onlineSignal/playbackDegraded/
  // isOnline) are not guaranteed to change again once an attempt has fired —
  // a single-item playlist has no playlist advance, a flapping link can stop
  // flapping, and critically, a repeat failure of the SAME URL after a
  // refresh's remount never reaches context at all: notePlaybackOutcome's
  // own dedupe (`degradedURLRef.current === nextDegradedURL`) drops it
  // before `setPlaybackDegraded` is even called, so no React state change —
  // and no effect rerun — follows a refresh that quietly failed again. Every
  // run that exits while STILL degraded — whether it just refreshed or found
  // nothing to do — therefore arms a timer for the earliest of the next
  // allowed attempt or the age valve, so recovery never depends on another
  // edge arriving. The effect's own cleanup (and the top of every run)
  // clears any previously armed timer first, so dependency changes and
  // healthy transitions never leave a stale one behind.
  const wasOnlineRef = useRef(isOnline);
  const refreshBudgetRef = useRef<{
    url: string;
    attempts: number;
    startedAt: number;
  } | null>(null);
  // Wall-clock moment `playbackDegraded` most recently went false, latched
  // once per clear stretch so a later true can tell a genuine 60s settle
  // apart from a brief flicker.
  const degradedClearedAtRef = useRef<number | null>(null);
  const nextRefreshAttemptAtRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const clearRecoveryTimer = () => {
      if (recoveryTimerRef.current !== null) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
    };

    const runRecoveryCheck = (trueOnlineEdge: boolean) => {
      const now = Date.now();

      if (!playbackDegraded) {
        degradedClearedAtRef.current ??= now;
        return;
      }

      const url = degradedArtworkURLRef.current;
      const clearedAt = degradedClearedAtRef.current;
      degradedClearedAtRef.current = null;
      const settled =
        clearedAt !== null && now - clearedAt >= REFRESH_BUDGET_SETTLE_MS;

      let activeBudget = refreshBudgetRef.current;
      const urlChanged = url !== null && activeBudget?.url !== url;
      const aged =
        activeBudget !== null &&
        now - activeBudget.startedAt >= REFRESH_BUDGET_MAX_AGE_MS;

      if (!activeBudget || urlChanged || trueOnlineEdge || settled || aged) {
        activeBudget = {
          url: url ?? activeBudget?.url ?? '',
          attempts: 0,
          startedAt: now,
        };
        refreshBudgetRef.current = activeBudget;
        // A fresh budget gets a fresh attempt — a stale backoff computed
        // against the PREVIOUS episode must not gate the first attempt of a
        // new one (a different URL, a genuine online edge, a settled clear,
        // or the age valve all warrant an immediate try).
        nextRefreshAttemptAtRef.current = 0;
      }

      const budgetExhausted =
        activeBudget.attempts >= REFRESH_BUDGET_MAX_ATTEMPTS;
      const backoffGated = now < nextRefreshAttemptAtRef.current;

      if (!budgetExhausted && !backoffGated) {
        console.log('[AppContext] Degraded playback, refreshing artwork');
        canvasService.requestArtworkRefresh();
        activeBudget.attempts += 1;
        const backoffIndex = Math.min(
          activeBudget.attempts - 1,
          REFRESH_BUDGET_BACKOFF_MS.length - 1
        );
        nextRefreshAttemptAtRef.current =
          now + REFRESH_BUDGET_BACKOFF_MS[backoffIndex];
      }

      // Still degraded on exit — whether this run just refreshed or found
      // nothing to do — so arm the primary re-entry timer (see the comment
      // above the effect) for the earliest of the next allowed attempt or
      // the age valve. Re-read `attempts` fresh: the refresh above may just
      // have pushed the budget to exhausted.
      const stillBudgetExhausted =
        activeBudget.attempts >= REFRESH_BUDGET_MAX_ATTEMPTS;
      const ageDeadline = activeBudget.startedAt + REFRESH_BUDGET_MAX_AGE_MS;
      const nextDeadline = stillBudgetExhausted
        ? ageDeadline
        : Math.min(nextRefreshAttemptAtRef.current, ageDeadline);
      const delay = Math.max(0, nextDeadline - now);
      recoveryTimerRef.current = setTimeout(() => {
        recoveryTimerRef.current = null;
        runRecoveryCheck(false);
      }, delay);
    };

    const trueOnlineEdge = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    clearRecoveryTimer();
    runRecoveryCheck(trueOnlineEdge);

    return clearRecoveryTimer;
  }, [onlineSignal, playbackDegraded, isOnline]);

  // Explicit (non-fallback) cast committed, or the controller stopped
  // playback (disconnect / sleep) → the fallback's "guarantee something is
  // playing" job is over. Cancel any active request so a pending retry or
  // in-flight attempt can never cast the default playlist over the
  // controller's content — or onto a wall the controller just stopped.
  // Ordering with a concurrent displayDefaultPlaylist request is inherent:
  // all of these signals are synchronous window events, so whichever
  // command arrived last wins — explicit-then-default stays active (forced
  // default retained), default-then-explicit ends up cancelled (explicit
  // cast wins).
  useEffect(() => {
    const handleFallbackStandDown = () => {
      // Ref first: it must be visible to an in-flight attempt's shouldAbort
      // in this same task; the state update below only stops FUTURE effect
      // runs and clears the armed retry timer once React flushes.
      explicitCastSinceRequestRef.current = true;
      // The wall no longer shows a fallback cast, so a config change landing
      // later must NOT supersede — it would re-cast the default playlist
      // over the controller's content, or relight (and navigate awake) a
      // disconnected or sleeping wall.
      lastFallbackCastURLRef.current = null;
      setFallbackRequest(prev =>
        prev.active ? { ...prev, active: false } : prev
      );
    };
    window.addEventListener(
      CustomEventName.ExplicitPlaylistCast,
      handleFallbackStandDown
    );
    window.addEventListener(
      CustomEventName.PlaybackHalted,
      handleFallbackStandDown
    );
    return () => {
      window.removeEventListener(
        CustomEventName.ExplicitPlaylistCast,
        handleFallbackStandDown
      );
      window.removeEventListener(
        CustomEventName.PlaybackHalted,
        handleFallbackStandDown
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
