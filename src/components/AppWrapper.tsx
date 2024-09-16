'use client';

import {
  AppSettings,
  PUSH_METRIC_INTERVAL,
  SEND_LOG_EVENT_NUMBER,
  SEND_LOG_INTERVAL,
} from '@/constants';
import { AppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Config, DeviceName, KeyEvent } from '@/utils/platform';
import { CastCommand, Orientation } from '@/utils/types';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useContext, useEffect, useRef, useState } from 'react';
import QrCodePopUp from './qr-code-popup/QrCodePopUp';
import Script from 'next/script';
import { uploadMetricEventsFromLocalStorage } from '@/services/metric.service';
import DeviceManager from '@/utils/DeviceManager';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
  Daily, // Displaying exhibition
}

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(AppContext);
  if (!context) {
    return <div></div>;
  }

  const router = useRouter();

  const { castInfo, canvasService } = context.websocketData;
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [castState, setCastState] = useState<CastState>(CastState.None);
  // const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);
  const searchParams = useSearchParams();
  const [isWebOSTVLoaded, setIsWebOSTVLoaded] = useState(false);
  const [isWebOSTVDevLoaded, setIsWebOSTVDevLoaded] = useState(false);
  const pushMetricIntervalID = useRef<
    NodeJS.Timeout | string | number | undefined
  >(undefined);
  const sendLogEventInterval = useRef<NodeJS.Timeout | null>(null);

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

      const platform = searchParams.get('platform') ?? '';
      if (platform) {
        localStorage.setItem('platform', platform);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check version update
  useEffect(() => {
    const validateVersion = async () => {
      let duration = await AppService.getVersionCheckIntervalDuration();
      duration =
        duration > 0 ? duration : AppSettings.VERSION_CHECK_INTERVAL_DURATION;

      await checkVersion();

      const intervalID = setInterval(() => {
        checkVersion().catch((error: unknown) => {
          console.error(error);
        });
      }, duration);

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
    console.log('[INFO] Current Version:', currentVersion);
    console.log('[INFO] New Version:', newVersion);
    if (newVersion !== currentVersion) {
      window.location.reload();
    }
  };

  useEffect(() => {
    const handleEscapeKey = () => {
      router.back();
      canvasService.current.disconnect({}).catch((error: unknown) => {
        console.log(error);
      });
    };

    EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    EventEmitter.subscribe(Event.escape, handleEscapeKey);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    };
  });

  useEffect(() => {
    const sendLog = async () => {
      const primaryAddress = await DeviceManager.getPrimaryAddress();
      const deviceId = await DeviceManager.getDeviceId();
      const deviceName = await DeviceManager.getName();
      const logTitle = `${deviceName}_${deviceId}_${primaryAddress ?? ''}_${new Date().toISOString()}.log`;
      const tags: string[] = [];

      const data = {
        userId: primaryAddress ? primaryAddress : deviceId,
        logTitle,
        metadata: {
          primaryAddress,
          deviceName,
          deviceId,
        },
        tags,
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).Log?.postMessage(
        JSON.stringify({
          data: data,
        })
      );
    };

    const handleSendLogEvent = () => {
      countEvent++;
      // Send log after reach event number
      if (countEvent >= SEND_LOG_EVENT_NUMBER) {
        sendLog().catch((error: unknown) => {
          console.log('Error when send log', error);
        });
      }

      if (sendLogEventInterval.current) {
        clearInterval(sendLogEventInterval.current);
      }

      // Reset counter after 10 seconds if not receive another event
      sendLogEventInterval.current = setInterval(() => {
        countEvent = 0;
      }, SEND_LOG_INTERVAL);
    };

    let countEvent = 0;
    EventEmitter.unSubscribe(Event.sendLog, handleSendLogEvent);
    EventEmitter.subscribe(Event.sendLog, handleSendLogEvent);

    return () => {
      EventEmitter.unSubscribe(Event.sendLog, handleSendLogEvent);
      if (sendLogEventInterval.current) {
        clearInterval(sendLogEventInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    console.log('[CAST] process cast info:', JSON.stringify(castInfo));
    if (castInfo) {
      const disableBackChanged = () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          (window as any).AppState?.postMessage(
            JSON.stringify({
              handler: 'backAbleChanged',
              data: true,
            })
          );
        } catch (error) {
          console.error(error);
        }
      };
      const handleCastCommand = () => {
        switch (castInfo.castCommand) {
          case CastCommand.castListArtwork: {
            if (castState === CastState.Artwork) {
              return;
            }

            setCastState(CastState.Artwork);
            if (castState === CastState.None) {
              router.push('/playlist');
            } else {
              router.replace('/playlist');
            }
            disableBackChanged();
            break;
          }

          case CastCommand.castExhibition: {
            if (castState === CastState.Exhibition) {
              return;
            }

            setCastState(CastState.Exhibition);
            if (castState === CastState.None) {
              router.push('/exhibitions');
            } else {
              router.replace('/exhibitions');
            }
            disableBackChanged();

            break;
          }

          case CastCommand.castDaily: {
            if (castState === CastState.Daily) {
              return;
            }

            setCastState(CastState.Daily);
            if (castState === CastState.None) {
              router.push('/daily');
            } else {
              router.replace('/daily');
            }
            disableBackChanged();
            break;
          }

          default: {
            break;
          }
        }
      };
      handleCastCommand();
    } else {
      if (castState !== CastState.None && castState !== CastState.Daily) {
        // Disconnect
        setCastState(CastState.None);
        router.back();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castInfo]);

  useEffect(() => {
    if (isWebOSTVLoaded && isWebOSTVDevLoaded) {
      DeviceManager.init().catch((error: unknown) => {
        console.log(error);
      });
      if (pushMetricIntervalID.current) {
        clearInterval(pushMetricIntervalID.current);
      }

      pushMetricIntervalID.current = setInterval(() => {
        uploadMetricEventsFromLocalStorage();
      }, PUSH_METRIC_INTERVAL);
    }

    return () => {
      if (pushMetricIntervalID.current) {
        clearInterval(pushMetricIntervalID.current);
      }
    };
  }, [isWebOSTVLoaded, isWebOSTVDevLoaded]);

  return (
    <>
      <Script
        src="/webOSTVjs-1.2.11/webOSTV.js"
        onLoad={() => {
          setIsWebOSTVLoaded(true);
        }}
      />
      <Script
        src="/webOSTVjs-1.2.11/webOSTV-dev.js"
        onLoad={() => {
          setIsWebOSTVDevLoaded(true);
        }}
      />
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
        <QrCodePopUp></QrCodePopUp>
      </div>
      <div
        style={{
          position: 'fixed',
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'transparent',
          top: 0,
          left: 0,
        }}></div>
    </>
  );
};

export default AppWrapper;
