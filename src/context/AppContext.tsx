'use client';

import {
  ReactNode,
  createContext,
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
  const [isFallbackPlaylist, setIsFallbackPlaylist] = useState(false);

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

    if (castInfo) {
      const criticalTempValue = await DeviceManager.getItem(
        LocalStorageItem.criticalTemp
      );
      const hasCriticalTemp = criticalTempValue === 'true';
      if (hasCriticalTemp) {
        // Fetch and cast default playlist after critical temp reset
        setIsFallbackPlaylist(true);
        await DeviceManager.removeItem(LocalStorageItem.criticalTemp);
        return;
      }

      if (castInfo.castCommand?.toString() === 'castDaily') {
        setIsFallbackPlaylist(true);
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
      setIsFallbackPlaylist(true);
    }
  };


  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const appRemoteConfig =
          await remoteConfigService.current.getAppRemoteConfig();
        setAppConfig(appRemoteConfig);
      } catch (error) {
        console.log('[API] Failed to load config:', error);
        setAppConfig({
          duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
          defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
        });
      }
    };

    fetchConfig().catch((error: unknown) => {
      console.log('[API] Failed to load config:', error);
    });
  }, []);

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
  //   - re-keying on `isOnline`, so the moment Wi-Fi provisioning lands the
  //     next attempt fires immediately (art is ready behind the setup overlay
  //     before the claim even completes). The re-key also resets the backoff.
  // Success clears `isFallbackPlaylist`, which ends the loop; a later
  // castDaily/critical-temp boot sets it again and re-arms this effect.
  useEffect(() => {
    if (!(appRemoteConfig.defaultPlaylistURL && isFallbackPlaylist)) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelayMs = FALLBACK_PLAYLIST_RETRY_INITIAL_MS;

    const attempt = async () => {
      console.log('[AppContext] Fallback default playlist attempt');
      const casted = await canvasService.castPlaylistByURL(
        appRemoteConfig.defaultPlaylistURL
      );
      if (cancelled) {
        return;
      }
      if (casted) {
        setIsFallbackPlaylist(false);
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
  }, [appRemoteConfig.defaultPlaylistURL, isFallbackPlaylist, isOnline, router]);

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
        },
      }}>
      {children}
    </AppContext.Provider>
  );
};
