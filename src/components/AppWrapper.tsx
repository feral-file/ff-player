'use client';

import { useAppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { LocalStorageItem } from '@/constants';
import AppService from '@/services/app.service';
import DeviceManager from '@/utils/DeviceManager';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  CustomEventName,
  NavigateEventDetail,
} from '@/models/custom_event';
import DP1ScheduleService from '@/services/DP1ScheduleService';
import ScheduleDisplay from './ScheduleDisplay';
import MintPairingOverlay from './mint-pairing/MintPairingOverlay';

const enum CastState {
  None, // Not casting
  Playlist, // Displaying playlist
}

const shouldCheckForUpdates =
  process.env.NEXT_PUBLIC_DISABLE_VERSION_CHECK !== 'true';

/**
 * Polls `version.json` for the web deployment only. The static FF OS bundle
 * disables the hook entirely so device-local installs do not try to self-reload
 * against a file that is not shipped with that artifact.
 */
const useVersionUpdateReload = (duration: number | undefined) => {
  useEffect(() => {
    if (!shouldCheckForUpdates || !duration) {
      return;
    }

    const checkVersion = async () => {
      const [currentVersion, newVersion] = await Promise.all([
        AppService.getCurrentVersion(),
        AppService.getVersion(),
      ]);

      if (newVersion !== currentVersion) {
        try {
          await DeviceManager.setItem(
            LocalStorageItem.versionUpdateReload,
            'true'
          );
        } catch (error) {
          console.error(
            '[AppWrapper] Error setting version update reload flag:',
            error
          );
        }

        window.location.reload();
      }
    };

    checkVersion().catch((error: unknown) => {
      console.error('[AppWrapper] Error checking version:', error);
    });

    const intervalID = window.setInterval(() => {
      checkVersion().catch((error: unknown) => {
        console.error('[AppWrapper] Error checking version:', error);
      });
    }, duration);

    return () => {
      window.clearInterval(intervalID);
    };
  }, [duration]);
};

// Separate loading component
const LoadingWrapper: React.FC = () => {
  return <></>;
};

// Main component that only renders when initialized
const InitializedAppWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { context } = useAppContext();
  const router = useRouter();
  const pathname = usePathname();
  const castInfo = context.castInfo;
  const [castState, setCastState] = useState<CastState>(CastState.None);
  useVersionUpdateReload(context.appRemoteConfig.duration);

  useEffect(() => {
    const navigate = (event: Event) => {
      try {
        const { path } = (event as CustomEvent<NavigateEventDetail>)
          .detail;
        if (path && typeof path === 'string') {
          router.replace(path);
        }
      } catch (error) {
        console.error('[AppWrapper] Error navigating to error page:', error);
      }
    };

    window.addEventListener(CustomEventName.Navigate, navigate);

    return () => {
      window.removeEventListener(CustomEventName.Navigate, navigate);
    };
  }, [router]);

  // Check for scheduled DP1 tasks
  useEffect(() => {
    DP1ScheduleService.checkScheduledTask().catch((error: unknown) => {
      console.error('[AppWrapper] Error checking scheduled tasks:', error);
    });
  }, []);

  useEffect(() => {
    if (!castInfo) {
      setCastState(CastState.None);
      return;
    }

    const handleCastCommand = () => {
      switch (castInfo.castCommand) {
        case CastCommand.displayPlaylist: {
          if (pathname === '/playlist') {
            return;
          }

          setCastState(CastState.Playlist);
          if (castState === CastState.None) {
            router.push('/playlist');
          } else {
            router.replace('/playlist');
          }
          break;
        }

        default: {
          break;
        }
      }
    };

    if (pathname === '/error' || pathname === '/sleep') {
      return;
    }

    handleCastCommand();
  }, [castInfo, castState, pathname, router]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100vw',
        height: '100vh',
      }}>
      {children}
      <ScheduleDisplay />
    </div>
  );
};

// Wrapper component that conditionally renders based on initialization state
const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { context } = useAppContext();
  const appContent = context.isInitialized ? (
    <InitializedAppWrapper>{children}</InitializedAppWrapper>
  ) : (
    <LoadingWrapper />
  );

  return (
    <>
      {appContent}
      {/* Keep the CDP-driven mint pairing listener mounted during boot. */}
      <MintPairingOverlay />
    </>
  );
};

export default AppWrapper;
