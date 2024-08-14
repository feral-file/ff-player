'use client';

import { AppSettings } from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import DeviceManager from '@/utils/DeviceManager';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import { CastCommand, Orientation } from '@/utils/types';
import { usePathname, useRouter } from 'next/navigation';
import React, { useContext, useEffect, useRef, useState } from 'react';
import LostConnectionModal from './LostConnectionModal';
import OnboardingModal from './OnboardingModal';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
}

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no App context.</p>;
  }

  const pathName = usePathname();
  const router = useRouter();
  const { castInfo } = context.websocketData;
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [castState, setCastState] = useState<CastState>(CastState.None);
  const castStatusRef = useRef(false);
  const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);

  // Initialize platform events
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('window', window);

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).KeyEvent = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: KeyEvent.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).DeviceName = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: DeviceName.handlePlatformEvent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).Config = {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        handlePlatformEvent: Config.handlePlatformEvent,
      };
    }
  }, []);

  // Handle keydown event
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handleKeyDown = () => {
      if (pathName === 'daily') {
        router.replace('/home');
      } else if (pathName === 'home') {
        router.replace('/daily');
      }
    };

    EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    EventEmitter.subscribe(Event.keyDown, handleKeyDown);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    };
  }, []);

  useEffect(() => {
    castStatusRef.current = castState !== CastState.None;
    try {
      (window as any).AppState.postMessage(
        JSON.stringify({
          handler: 'backAbleChanged',
          data: castStatusRef.current,
        })
      );
    } catch (error) {}
  }, [castState]);

  // Check version update
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const validateVersion = async () => {
      await checkVersion();
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const intervalID = setInterval(async () => {
        await checkVersion();
      }, AppSettings.VERSION_CHECK_INTERVAL_DURATION);

      return () => {
        clearInterval(intervalID);
      };
    };

    validateVersion().catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  const checkVersion = async () => {
    const currentVersion = await AppService.getCurrentVersion();
    const newVersion = await AppService.getVersion();
    console.log('Current Version:', currentVersion);
    console.log('New Version:', newVersion);
    if (newVersion !== currentVersion) {
      window.location.reload();
    }
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('--------------');
    console.log('Cast Info:', castInfo);
    console.log('--------------');

    if (castInfo) {
      const handleCastCommand = async () => {
        switch (castInfo.castCommand) {
          case CastCommand.connect: {
            if (
              !(await DeviceManager.isPreviouslyConnectedDevice(
                castInfo.deviceInfo?.deviceId ?? ''
              ))
            ) {
              setDisplayOnboarding(true);
              await DeviceManager.addPreviouslyConnectedDeviceId(
                castInfo.deviceInfo?.deviceId ?? ''
              );
            }
            break;
          }

          case CastCommand.castListArtwork: {
            setDisplayOnboarding(false);
            if (castState === CastState.Artwork) {
              return;
            }

            setCastState(CastState.Artwork);
            castState === CastState.None
              ? router.push('/playlist')
              : router.replace('/playlist');
            break;
          }

          case CastCommand.castExhibition: {
            setDisplayOnboarding(false);

            console.log('castState:', castState);

            if (castState === CastState.Exhibition) {
              return;
            }

            setCastState(CastState.Exhibition);
            castState === CastState.None
              ? router.push('/exhibitions')
              : router.replace('/exhibitions');
            break;
          }
        }
      };
      handleCastCommand().catch((error: unknown) => {
        console.error(error);
      });
    } else {
      if (castState !== CastState.None) {
        setCastState(CastState.None);
        console.log('router.back()');

        router.back();
      }
    }
  }, [castInfo]);

  return (
    <div
      style={{
        width:
          (screenOrientation === Orientation.vertical &&
            (rotateRadius || 0) % 180 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            (rotateRadius || 0) % 180 === 0)
            ? '100vw'
            : '100vh',
        height:
          (screenOrientation === Orientation.vertical &&
            (rotateRadius || 0) % 180 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            (rotateRadius || 0) % 180 === 0)
            ? '100vh'
            : '100vw',
        transform: `rotate(${-(rotateRadius || 0)}deg) `,
        transformOrigin: `${
          (screenOrientation === Orientation.vertical &&
            (rotateRadius || 0) % 360 !== 90) ||
          (screenOrientation === Orientation.horizontal &&
            (rotateRadius || 0) % 360 !== 90)
            ? '50vw center'
            : 'center 50vh'
        }`,
        transition: 'transform 0.2s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      {displayOnboarding && <OnboardingModal />}
      {children}
    </div>
  );
};

export default AppWrapper;
