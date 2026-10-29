import { CastInfo } from '@/models';
import {
  ConnectivityEventDetail,
  CustomEventName,
} from '@/models/custom_event';
import { CDPRequestHandler } from '@/services/cdp-handler/CDPRequestHandler';
import DeviceManager from '@/utils/DeviceManager';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAppRemoteConfig } from './useAppRemoteConfig';
import { useBootHydration } from './useBootHydration';
import {
  useFallbackCommands,
  useFallbackPlaylist,
} from './useFallbackPlaylist';
import { usePlaybackReconnect } from './usePlaybackReconnect';
/** Counts raw online notifications, including repeated true values from daemon replay. */
function useOnlineNotifications(
  setOnlineSignal: React.Dispatch<React.SetStateAction<number>>
) {
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
  }, [setOnlineSignal]);
}
/** Keeps CDP registration independent of boot I/O and tears it down with the provider. */
function useCDPBridge() {
  useEffect(() => {
    const cdpRequestHandler = CDPRequestHandler.getInstance();
    cdpRequestHandler.initialize();
    return () => {
      cdpRequestHandler.cleanup();
    };
  }, []);
}
/** Retains the existing connectivity-triggered storage read without making it a boot precondition. */
function useConnectivityCastRead(isOnline: boolean) {
  const isFirstRender = useRef(true);
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
}
/** Preserves provider effect ordering: config, CDP, fallback, notifications, recovery, command listeners, then hydration. */
export function usePlayerRuntime(ports: {
  initializeDisplaySettings: () => Promise<void>;
  setCastInfo: (cast: CastInfo | null) => void;
  router: ReturnType<typeof useRouter>;
  isOnline: boolean;
}) {
  const [onlineSignal, setOnlineSignal] = useState(0);
  const appRemoteConfig = useAppRemoteConfig(onlineSignal);
  useCDPBridge();
  const fallback = useFallbackPlaylist(
    appRemoteConfig.defaultPlaylistURL,
    onlineSignal,
    ports.router
  );
  useOnlineNotifications(setOnlineSignal);
  const degraded = usePlaybackReconnect(onlineSignal, ports.isOnline);
  useFallbackCommands(fallback);
  const isInitialized = useBootHydration({
    initializeDisplaySettings: ports.initializeDisplaySettings,
    setCastInfo: ports.setCastInfo,
    requestFallbackPlaylist: fallback.request,
    navigateToHomePage: () => {
      if (window.location.pathname !== '/') {
        console.log('navigate to home page');
        ports.router.push('/');
      }
    },
  });
  useConnectivityCastRead(ports.isOnline);
  return { appRemoteConfig, isInitialized, ...degraded };
}
