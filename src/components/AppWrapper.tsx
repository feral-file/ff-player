'use client';

import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { CastCommand } from '@/models';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import CanvasService from '@/services/CanvasService';
import {
  CustomEventName,
  NavigateToErrorEventDetail,
} from '@/models/custom_event';
import { LocalStorageItem } from '@/constants';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
  Daily, // Displaying exhibition
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
  const canvasService = CanvasService.getInstance();
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
    if (!castInfo) return;

    console.log('[AppWrapper] process cast info:', JSON.stringify(castInfo));
    console.log('AppWrapper castState', castState);

    const checkRemoveCriticalTemp = () => {
      if (
        castInfo.castCommand &&
        [
          CastCommand.castDaily,
          CastCommand.castListArtwork,
          CastCommand.castExhibition,
        ].includes(castInfo.castCommand)
      ) {
        localStorage.removeItem(LocalStorageItem.criticalTemp);
      }
    };

    const handleCastCommand = () => {
      switch (castInfo.castCommand) {
        case CastCommand.castListArtwork: {
          if (pathname === '/playlist') {
            return;
          }

          setCastState(CastState.Artwork);
          if (castState === CastState.None) {
            router.push('/playlist');
          } else {
            router.replace('/playlist');
          }
          break;
        }

        case CastCommand.castExhibition: {
          if (pathname === '/exhibitions') {
            return;
          }

          setCastState(CastState.Exhibition);
          if (castState === CastState.None) {
            router.push('/exhibitions');
          } else {
            router.replace('/exhibitions');
          }

          break;
        }

        case CastCommand.castDaily: {
          if (pathname === '/daily') {
            return;
          }

          setCastState(CastState.Daily);
          if (castState === CastState.None) {
            router.push('/daily');
          } else {
            router.replace('/daily');
          }
          break;
        }

        default: {
          break;
        }
      }
    };

    checkRemoveCriticalTemp();
    handleCastCommand();
  }, [castInfo, pathname]);

  useEffect(() => {
    if (castInfo) return;
    if (castState !== CastState.None && castState !== CastState.Daily) {
      // Disconnect
      setCastState(CastState.None);
      router.back();
    } else {
      try {
        canvasService.castDaily({});
      } catch (error) {
        console.log('[AppWrapper] Error Cast daily', error);
      }
    }
  }, [castInfo, castState, router]);

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
