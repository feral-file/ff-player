'use client';

import { AppSettings, IgnoreKeyDown, KeyDown } from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import DeviceManager from '@/utils/DeviceManager';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import { CastCommand, Orientation } from '@/utils/types';
import { useRouter } from 'next/navigation';
import React, { useContext, useEffect, useRef, useState } from 'react';
import OnboardingModal from './OnboardingModal';
import QrCodePopUp from './qr-code-popup/QrCodePopUp';
import Script from 'next/script';

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
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const lastEventTime = useRef(0);

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
  });

  // Handle keydown event
  useEffect(() => {
    const handleKeyDown = () => {
      setShowQrCode(!showQrCode);
    };

    EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
    EventEmitter.subscribe(Event.toggleQrCode, handleKeyDown);

    return () => {
      EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
    };
  }, [showQrCode]);

  // Add event listener for press button 0 to toggle QR code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        if (!IgnoreKeyDown.includes(event.key as KeyDown)) {
          console.log('Toggle QR Code');

          setShowQrCode(!showQrCode);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showQrCode]);

  // Handle keydown event

  // useEffect(() => {
  //   const handleKeyDown = () => {
  //     setShowQrCode(!showQrCode);
  //   };

  //   EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
  //   EventEmitter.subscribe(Event.toggleQrCode, handleKeyDown);

  //   return () => {
  //     EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
  //   };
  // }, []);

  // Check version update
  useEffect(() => {
    const validateVersion = async () => {
      await checkVersion();

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
            if (castInfo.dataChecked) {
              setShowQrCode(true);
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castInfo]);

  useEffect(() => {
    if (showQrCode) {
      const timeoutID = setTimeout(() => {
        setShowQrCode(false);
      }, 30000);

      return () => {
        clearTimeout(timeoutID);
      };
    }
  }, [showQrCode]);

  const handleCloseQRCode = () => {
    setShowQrCode(false);
  };

  return (
    <>
      <Script
        src="/webOSTVjs-1.2.11/webOSTV.js"
        onLoad={() => {
          console.log('loaded');
        }}></Script>
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
          transform: `rotate(${(-rotateRadius || 0).toString()}deg) `,
          transformOrigin:
            (screenOrientation === Orientation.vertical &&
              (rotateRadius || 0) % 360 !== 90) ||
            (screenOrientation === Orientation.horizontal &&
              (rotateRadius || 0) % 360 !== 90)
              ? '50vw center'
              : 'center 50vh',
          transition: 'transform 0.2s',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {children}
        {showQrCode && <QrCodePopUp onClick={handleCloseQRCode}></QrCodePopUp>}
      </div>
    </>
  );
};

export default AppWrapper;
