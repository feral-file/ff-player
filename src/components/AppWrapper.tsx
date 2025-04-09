'use client';

import { AppSettings } from '@/constants';
import { useAppContext } from '@/context/AppContext';
import AppService from '@/services/app.service';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import { CastCommand } from '@/utils/types';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { getUserLocale } from '@/utils/locale';
import CanvasService from '@/services/CanvasService';

const enum CastState {
  None, // Not casting
  Artwork, // Displaying artwork, playlist, dallies
  Exhibition, // Displaying exhibition
  Daily, // Displaying exhibition
}

// Separate loading component
const LoadingWrapper: React.FC = () => {
  return <></>;
};

// Main component that only renders when initialized
const InitializedAppWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { context } = useAppContext();
  const router = useRouter();
  const canvasService = CanvasService.getInstance();
  const castInfo = context.castInfo;
  const [castState, setCastState] = useState<CastState>(CastState.None);
  const [messages, setMessages] = useState<AbstractIntlMessages>();
  const locale = getUserLocale();

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
  }, [context.appRemoteConfig]);

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
    };

    EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    EventEmitter.subscribe(Event.escape, handleEscapeKey);

    // Cleanup the event listener on component unmount
    return () => {
      EventEmitter.unSubscribe(Event.escape, handleEscapeKey);
    };
  }, [router]);

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
    if (!castInfo) return;

    console.log('[AppWrapper] process cast info:', JSON.stringify(castInfo));

    const handleCastCommand = () => {
      console.log('AppWrapper castInfo', castInfo);
      console.log('AppWrapper castState', castState);

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
  }, [castInfo]);

  useEffect(() => {
    if (castInfo) return;

    if (castState !== CastState.None && castState !== CastState.Daily) {
      // Disconnect
      setCastState(CastState.None);
      router.back();
    } else {
      canvasService.castDaily({}).catch((error: unknown) => {
        console.log('[AppWrapper] Error Cast daily', error);
      });
    }
  }, [castInfo, castState, router]);

  return messages != undefined ? (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          transformOrigin: 'center 50vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {children}
      </div>
    </NextIntlClientProvider>
  ) : (
    <></>
  );
};

// Wrapper component that conditionally renders based on initialization state
const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { context } = useAppContext();

  if (!context.isInitialized) {
    return <LoadingWrapper />;
  }

  return <InitializedAppWrapper>{children}</InitializedAppWrapper>;
};

export default AppWrapper;
