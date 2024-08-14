'use client';

import { AppSettings } from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import { Orientation } from '@/utils/types';
import React, { useContext, useEffect, useRef, useState } from 'react';

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

  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };

  // Init
  useEffect(() => {
    (window as any).KeyEvent = {
      handlePlatformEvent: KeyEvent.handlePlatformEvent,
    };
    (window as any).DeviceName = {
      handlePlatformEvent: DeviceName.handlePlatformEvent,
    };
    (window as any).Config = {
      handlePlatformEvent: Config.handlePlatformEvent,
    };
  }, []);

  // listen castInfo

  // handle redirect to daily

  // ----------------- Listen back event -----------------
  useEffect(() => {
    const handleEscapeKey = () => {
      console.log('Escape key pressed');
      // if (castStatusRef.current) {
      //   refreshData();
      //   if (canvasService?.current != null) {
      //     canvasService?.current?.disconnect({});
      //   }
      //   clearTimer();
      // }
    };

    EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    EventEmitter.subscribe(Event.escape, handleEscapeKey);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    };
  }, []);

  const [castState, setCastState] = useState<CastState>(CastState.None);
  const castStatusRef = useRef(false);
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

  // ----------------- Listen back event -----------------
  useEffect(() => {
    checkVersion();
    const intervalID = setInterval(async () => {
      checkVersion();
    }, AppSettings.VERSION_CHECK_INTERVAL_DURATION);

    return () => clearInterval(intervalID);
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
      {children}
    </div>
  );
};

export default AppWrapper;
