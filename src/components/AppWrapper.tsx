'use client';

import { AppSettings, DeviceInfo, LocalStorageItem } from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { Orientation } from '@/utils/types';
import React, { useContext, useEffect, useState } from 'react';
import Script from 'next/script';
import FullScreen from './fullscreen';

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(AppContext);
  if (!context) {
    return <div></div>;
  }

  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [isDisplayWebAction, setIsDisplayWebAction] = useState<boolean>(false);

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

  const setDeviceName = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (window as any).webOS.deviceInfo((deviceInfo: DeviceInfo) => {
        const deviceName = `LG-${deviceInfo.modelName}`;
        localStorage.setItem(LocalStorageItem.name, deviceName);
      });
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <Script
        src="/webOSTVjs-1.2.11/webOSTV.js"
        onLoad={setDeviceName}></Script>
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
      </div>
    </>
  );
};

export default AppWrapper;
