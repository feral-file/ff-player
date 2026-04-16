'use client';

import { useAppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { useRouter, usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  CustomEventName,
  NavigateEventDetail,
} from '@/models/custom_event';
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
  }, [castInfo, pathname, castState, router]);

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
