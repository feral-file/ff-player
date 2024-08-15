'use client';

import { AppSettings } from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import DeviceManager from '@/utils/DeviceManager';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import { CastCommand, Orientation } from '@/utils/types';
import { useRouter } from 'next/navigation';
import React, { useContext, useEffect, useState } from 'react';
import OnboardingModal from './OnboardingModal';
import QrCodePopUp from './qrCodePopUp';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
}

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(AppContext);
  if (!context) {
    return <div></div>;
  }

  const router = useRouter();

  const { castInfo } = context.websocketData;
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [castState, setCastState] = useState<CastState>(CastState.None);
  const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);
  const [showQrCode, setShowQrCode] = useState<boolean>(true);

  // Initialize platform events
  useEffect(() => {
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
      setDisplayOnboarding(!displayOnboarding);
    };

    EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    EventEmitter.subscribe(Event.keyDown, handleKeyDown);

    return () => {
      EventEmitter.unSubscribe(Event.keyDown, handleKeyDown);
    };
  }, []);

  // Check version update
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const validateVersion = async () => {
      await checkVersion();
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const intervalID = setInterval(() => {
        checkVersion().catch((error: unknown) => {
          console.error(error);
        });
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
    console.log('Cast Info:', castInfo);
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
            if (castState === CastState.None) {
              router.push('/playlist');
            } else {
              router.replace('/playlist');
            }

            break;
          }

          case CastCommand.castExhibition: {
            setDisplayOnboarding(false);
            if (castState === CastState.Exhibition) {
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

          default: {
            break;
          }
        }
      };
      handleCastCommand().catch((error: unknown) => {
        console.error(error);
      });
    } else {
      if (castState !== CastState.None) {
        // Disconnect
        setCastState(CastState.None);
        router.back();
      }
    }
  }, [castInfo]);

  useEffect(() => {
    const timeoutID = setTimeout(() => {
      setShowQrCode(false);
    }, 30000);

    return () => {
      clearTimeout(timeoutID);
    };
  }, []);

  return (
    <>
      {displayOnboarding && <OnboardingModal />}
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
        {children}
        {showQrCode && <QrCodePopUp></QrCodePopUp>}
      </div>
    </>
  );
};

export default AppWrapper;
