'use client';

import {
  AppSettings,
  SEND_LOG_EVENT_NUMBER,
  SEND_LOG_INTERVAL,
} from '@/constants';
import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { Orientation } from '@/utils/types';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import DeviceManager from '@/utils/DeviceManager';

import { AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { getUserLocale } from '@/utils/locale';

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { context } = useAppContext();
  const router = useRouter();

  const { castInfo, canvasService } = context.websocketData;
  const { screenOrientation, rotateRadius } = context.deviceRotation ?? {
    screenOrientation: Orientation.horizontal,
    rotateRadius: 0,
  };
  const sendLogEventInterval = useRef<NodeJS.Timeout | null>(null);
  const [messages, setMessages] = useState<AbstractIntlMessages>();
  const locale = getUserLocale();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<string>(
    'Here would go the result of WebGL feature detection'
  );

  const [result2, setResult2] = useState<string>(
    'Here would go the result of WebGL2 feature detection'
  );

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

  const detectWebGLContext = () => {
    // Create canvas element. The canvas is not added to the
    // document itself, so it is never displayed in the
    // browser window.
    const canvas = document.createElement('canvas');

    // Get WebGLRenderingContext from canvas element.
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    // Report the result.
    const isSupported = gl instanceof WebGLRenderingContext;
    setResult(
      isSupported
        ? 'Congratulations! Your browser supports WebGL.'
        : 'Failed. Your browser or device may not support WebGL.'
    );

    // ---------
    const glContextAttributes = { preserveDrawingBuffer: true };
    const canvas2 = document.getElementById('canvas') as HTMLCanvasElement;
    if (canvas2) {
      const gl2 = canvas2.getContext('webgl2', glContextAttributes);
      setResult2(
        gl2 instanceof WebGL2RenderingContext
          ? 'Congratulations! Your browser supports WebGL2.'
          : 'Failed. Your browser or device may not support WebGL2.'
      );
    }
  };

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
        {/* {children} */}

        <div style={{ textAlign: 'center' }}>
          <canvas id="canvas">Enable JavaScript in your browser</canvas>
          <p>[ {result} ]</p>
          <p>[ {result2} ]</p>
          <button
            ref={buttonRef}
            onClick={detectWebGLContext}
            style={{ padding: '1em', border: '1px solid', marginTop: '1em' }}>
            Press here to detect WebGLRenderingContext
          </button>
        </div>
      </div>
    </NextIntlClientProvider>
  ) : (
    <></>
  );
};

export default AppWrapper;
