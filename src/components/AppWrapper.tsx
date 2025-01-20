'use client';

import {
  AppSettings,
  LocalStorageItem,
  Platform,
  PUSH_METRIC_INTERVAL,
  SEND_LOG_EVENT_NUMBER,
  SEND_LOG_INTERVAL,
} from '@/constants';
import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { CastCommand, Orientation } from '@/utils/types';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { uploadMetricEventsFromLocalStorage } from '@/services/metric.service';
import DeviceManager from '@/utils/DeviceManager';

import { AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { getUserLocale } from '@/utils/locale';
import ArtDiscovery from './art-discovery/ArtDiscovery';
import CanvasService from '@/services/CanvasService';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
  Daily, // Displaying exhibition
}

// The webOS declaration for access the LG webOS functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const webOS: any;

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { context } = useAppContext();
  const router = useRouter();
  const pathname = usePathname();

  const canvasService = CanvasService.getInstance();
  const castInfo = context.castInfo;
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const [castState, setCastState] = useState<CastState>(CastState.None);
  // const [displayOnboarding, setDisplayOnboarding] = useState<boolean>(false);
  const isWebOSTVLoaded = context.isWebOSTVLoaded;
  const isWebOSTVDevLoaded = context.isWebOSTVDevLoaded;
  const pushMetricIntervalID = useRef<
    NodeJS.Timeout | string | number | undefined
  >(undefined);
  const sendLogEventInterval = useRef<NodeJS.Timeout | null>(null);
  const [messages, setMessages] = useState<AbstractIntlMessages>();
  const locale = getUserLocale();

  const [hasLocalStorage, setHasLocalStorage] = useState<boolean>(false);

  useEffect(() => {
    setHasLocalStorage(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      typeof window !== 'undefined' && window.localStorage ? true : false
    );
  }, []);

  // Initialize platform events
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check version update
  useEffect(() => {
    const validateVersion = async () => {
      const duration =
        context.appRemoteConfig?.duration ||
        AppSettings.VERSION_CHECK_INTERVAL_DURATION;
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
      canvasService.disconnect({}).catch((error: unknown) => {
        console.log(error);
      });

      if (window.history.length <= 1 || pathname === '/daily') {
        const platform = (localStorage.getItem(LocalStorageItem.platform) ??
          'web') as Platform;
        if (platform === Platform.lg) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          webOS.platformBack();
        }
      }
    };

    EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    EventEmitter.subscribe(Event.escape, handleEscapeKey);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    };
  });

  useEffect(() => {
    const fetchMessages = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const localeJson = await import(`../../locales/${locale}.json`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      setMessages(localeJson.default as AbstractIntlMessages);
    };
    fetchMessages().catch((error: unknown) => {
      console.error(error);
    });
  }, [locale]);

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

  return messages != undefined ? (
    <NextIntlClientProvider locale={locale} messages={messages}>
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
        {/* {hasLocalStorage && <ArtDiscovery></ArtDiscovery>}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            zIndex: 8,
            background: 'transparent',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}></div> */}
      </div>
    </NextIntlClientProvider>
  ) : (
    <></>
  );
};

export default AppWrapper;
