'use client';
import { CastInfo } from '@/models';
import { DisplaySettings } from '@/models/display_settings.model';
import useCastInfo from '@/services/custom-hooks/useCastInfo';
import useCursorPositions, {
  CursorPosition,
} from '@/services/custom-hooks/useCursorPositions';
import useDeviceRotation, {
  DeviceRotation,
} from '@/services/custom-hooks/useDeviceRotation';
import { useDeviceSettings } from '@/services/custom-hooks/useDeviceSettings';
import useNetworkManger from '@/services/custom-hooks/useNetworkManager';
import { AppRemoteConfig } from '@/services/remoteConfigService';
import { useRouter } from 'next/navigation';
import { ReactNode, createContext, useContext } from 'react';
import { usePlayerRuntime } from './runtime/usePlayerRuntime';
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
   * PlaybackReconnect owner, and SetupArtworkBackground, which shows
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
   * owner in runtime/PlaybackReconnect.
   */
  setPlaybackDegraded?: (degraded: boolean, url?: string) => void;
}
export const AppContext = createContext<AppContextValue | undefined>(undefined);
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within a AppProvider');
  }

  return context;
};
/** Publishes the app snapshot; lifecycle owners retain boot and recovery state. */
export const AppProvider = ({ children }: AppContextProps) => {
  const { castInfo, setCastInfo } = useCastInfo();
  const { displaySettings, initializeDisplaySettings } = useDeviceSettings();
  const { cursorPositions } = useCursorPositions();
  const router = useRouter();
  const isOnline = useNetworkManger();
  const deviceRotation = useDeviceRotation();
  const {
    appRemoteConfig,
    isInitialized,
    playbackDegraded,
    setPlaybackDegraded,
  } = usePlayerRuntime({
    initializeDisplaySettings,
    setCastInfo,
    router,
    isOnline,
  });
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
