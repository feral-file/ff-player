'use client';

import {
  AppSettings,
  SEND_LOG_EVENT_NUMBER,
  SEND_LOG_INTERVAL,
} from '@/constants';
import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import DeviceManager from '@/utils/DeviceManager';

import { AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { getUserLocale } from '@/utils/locale';
import ArtworkPlayer from './artwork-player/ArtworkPlayer';

const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { context } = useAppContext();
  const router = useRouter();

  const { canvasService } = context.websocketData;
  const [messages, setMessages] = useState<AbstractIntlMessages>();
  const locale = getUserLocale();
  const sendLogEventInterval = useRef<NodeJS.Timeout | null>(null);

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

  return messages != undefined ? (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          transition: 'transform 0.2s',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <div style={{ width: '100%', height: '100%' }}>
          <ArtworkPlayer
            previewURL={
              'https://cdn.feralfileassets.com/previews/e9c74592-8483-4511-adb2-16ef4730ca1a/1644976484/?edition_number=0&blockchain=bitmark'
            }
            artworkID={''}
          />
        </div>
      </div>
    </NextIntlClientProvider>
  ) : (
    <></>
  );
};

export default AppWrapper;
