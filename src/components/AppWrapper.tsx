'use client';

import {
  AppSettings,
  KeyDown,
  LocalStorageItem,
  AIRecordedKeyCodes,
  KeyCodes,
} from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Orientation } from '@/utils/types';
import { useRouter } from 'next/navigation';
import React, { useContext, useEffect, useRef, useState } from 'react';
import QrCodePopUp from './qr-code-popup/QrCodePopUp';
import Script from 'next/script';
import FullScreen from './fullscreen';

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(AppContext);
  if (!context) {
    return <div></div>;
  }

  const router = useRouter();
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const lastEventTime = useRef(0);
  const [isDisplayWebAction, setIsDisplayWebAction] = useState<boolean>(false);

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
        if (AIRecordedKeyCodes.includes(event.keyCode as KeyCodes)) {
          setShowQrCode(false);
          router.push('/ai-artwork');
          return;
        }

        // Toggle QR code when user press Enter
        if ((event.key as KeyDown) === KeyDown.enter) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrCode]);

  useEffect(() => {
    const platform = localStorage.getItem(LocalStorageItem.platform);
    setIsDisplayWebAction(!platform);
  }, [isDisplayWebAction]);

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
    if (showQrCode) {
      const timeoutID = setTimeout(() => {
        setShowQrCode(false);
      }, 30000);

      return () => {
        clearTimeout(timeoutID);
      };
    }
  }, [showQrCode]);

  return (
    <>
      <Script
        src="/webOSTVjs-1.2.11/webOSTV.js"
        onLoad={() => {
          console.log('loaded');
        }}></Script>
      {isDisplayWebAction && (
        <div
          style={{
            position: 'fixed',
            top: 15,
            right: 15,
            cursor: 'pointer',
            zIndex: 2,
          }}>
          <FullScreen />
        </div>
      )}
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
          transform: `rotate(${(rotateRadius || 0).toString()}deg) `,
          transformOrigin:
            (screenOrientation === Orientation.vertical &&
              (rotateRadius || 0) % 360 === 90) ||
            (screenOrientation === Orientation.horizontal &&
              (rotateRadius || 0) % 360 === 90)
              ? '50vw center'
              : 'center 50vh',
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
