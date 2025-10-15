'use client';

import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { CastCommand } from '@/models';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  CustomEventName,
  NavigateToErrorEventDetail,
} from '@/models/custom_event';
import { LocalStorageItem } from '@/constants';
import DP1ScheduleService from '@/services/DP1ScheduleService';
import ScheduleDisplay from './ScheduleDisplay';

const enum CastState {
  None, // Not casting
  Playlist, // Displaying playlist
}

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

  useEffect(() => {
    const navigateToError = (event: Event) => {
      const { path } = (event as CustomEvent<NavigateToErrorEventDetail>)
        .detail;
      if (path) {
        router.replace(path);
      }
    };

    window.addEventListener(CustomEventName.NavigateToError, navigateToError);

    return () => {
      window.removeEventListener(
        CustomEventName.NavigateToError,
        navigateToError
      );
    };
  }, []);

  // Check version update
  useEffect(() => {
    if (!context.appRemoteConfig.duration) {
      return;
    }

    checkVersion().catch((error: unknown) => {
      console.error(error);
    });

    const intervalID = setInterval(() => {
      checkVersion().catch((error: unknown) => {
        console.error(error);
      });
    }, context.appRemoteConfig.duration);

    return () => {
      clearInterval(intervalID);
    };
  }, [context.appRemoteConfig.duration]);

  // Check for scheduled DP1 tasks
  useEffect(() => {
    DP1ScheduleService.checkScheduledTask();
  }, []);

  const checkVersion = async () => {
    const [currentVersion, newVersion] = await Promise.all([
      AppService.getCurrentVersion(),
      AppService.getVersion(),
    ]);
    console.log('[INFO] Current Version:', currentVersion);
    console.log('[INFO] New Version:', newVersion);
    if (newVersion !== currentVersion) {
      window.location.reload();
    }
  };

  useEffect(() => {
    if (!castInfo) {
      setCastState(CastState.None);
      return;
    }

    const isOverheating =
      localStorage.getItem(LocalStorageItem.criticalTemp) === 'true';

    if (isOverheating) {
      return;
    }

    console.log('[AppWrapper] process cast info:', castInfo.castCommand);
    console.log('AppWrapper castState', castState);

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

    handleCastCommand();
  }, [castInfo, pathname]);

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

  if (!context.isInitialized) {
    return <LoadingWrapper />;
  }

  return <InitializedAppWrapper>{children}</InitializedAppWrapper>;
};

export default AppWrapper;
