'use client';

import { AppContext } from '@/context/AppContext';
import { Daily } from '@/models';
import { getDelayTime } from '@/services/qrCodePopUpService';
import DeviceManager from '@/utils/DeviceManager';
import Image from 'next/image';
import QRCode from 'qrcode.react';
import { useContext, useEffect, useRef, useState } from 'react';
import styles from './styles.module.scss';
import { QrCodeSkeleton } from '../skeleton/skeleton';
import { AppSettings, KeyDown, TIME_PER_HOUR } from '@/constants';
import { EventEmitter, Event } from '@/utils/EventEmitter';
import DailyService from '@/services/DailyService';
import { CastCommand } from '@/utils/types';
import { useTranslations } from 'next-intl';

const QrCodePopUp = () => {
  const context = useContext(AppContext);
  const [branchLink, setBranchLink] = useState('');
  const [currentDaily, setCurrentDaily] = useState<Daily>();
  const [nextArtwork, setNextArtwork] = useState<number>(0);
  const [isShowComponent, setIsShowComponent] = useState<boolean>(false);
  const [countdownPercentage, setCountdownPercentage] = useState<number>(0);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const [dailies, setDailies] = useState<Daily[]>([]);

  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };
  const { locationID, topicID } = context?.websocketData ?? {};
  const lastEventTime = useRef(0);
  const { castInfo } = context?.websocketData ?? {};
  const newDailyHour = context?.appRemoteConfig?.new_daily_hour;

  const t = useTranslations('QrCodePopUp');

  useEffect(() => {
    fetchDailies().catch((error: unknown) => {
      console.log(error);
    });
  }, []);

  useEffect(() => {
    if (locationID && topicID) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      const generateBranchLink = async () => {
        try {
          const url = await DeviceManager.getOrGenerateBranchLink();
          if (url) {
            setBranchLink(url);
          }
        } catch (error) {
          console.log(error);
        }
      };
      generateBranchLink().catch((error: unknown) => {
        console.log(error);
      });
    }
  }, [locationID, topicID]);

  useEffect(() => {
    const calculateTimer = () => {
      const { delay, duration } = getDelayTime(
        dailies,
        newDailyHour ?? AppSettings.DEFAULT_NEW_DAILY_HOUR
      );

      setNextArtwork((delay > 0 ? delay : 0) / TIME_PER_HOUR);
      let percentage = ((duration - delay) / duration) * 100;
      if (percentage < 0) {
        percentage = 0;
      }
      if (percentage > 100) {
        percentage = 100;
      }
      setCountdownPercentage(percentage);
    };

    if (dailies.length > 0) {
      setCurrentDaily(dailies[0]);
      setIsShowComponent(true);
      calculateTimer();

      intervalIdRef.current = setInterval(calculateTimer, 1000);
    } else {
      setIsShowComponent(false);
    }

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [dailies]);

  useEffect(() => {
    if (castInfo) {
      switch (castInfo.castCommand) {
        case CastCommand.connect:
        case CastCommand.castDaily:
        case CastCommand.castListArtwork:
        case CastCommand.castExhibition: {
          setIsShowComponent(false);
          break;
        }
      }
    }
  }, [castInfo]);

  const fetchDailies = async () => {
    let dailies = DailyService.getDailies();

    if (dailies.length === 0) {
      dailies = await DailyService.callingDailies(
        newDailyHour ?? AppSettings.DEFAULT_NEW_DAILY_HOUR
      );
    }
    setDailies(dailies);
  };

  useEffect(() => {
    if (isShowComponent) {
      fetchDailies.call(this).catch((error: unknown) => {
        console.log(error);
      });
      const timeoutID = setTimeout(() => {
        setIsShowComponent(false);
      }, 30000);

      return () => {
        clearTimeout(timeoutID);
      };
    }
  }, [isShowComponent]);

  // Add event listener for press button 0 to toggle QR code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        // Toggle QR code when user press Enter
        if ((event.key as KeyDown) === KeyDown.enter) {
          console.log('Toggle QR Code');
          setIsShowComponent(!isShowComponent);
        }
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement) {
        console.log('Toggle QR Code');
        setIsShowComponent(!isShowComponent);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('click', handleClick);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [isShowComponent]);

  // Handle keydown event
  useEffect(() => {
    const handleKeyDown = () => {
      setIsShowComponent(!isShowComponent);
    };

    EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
    EventEmitter.subscribe(Event.toggleQrCode, handleKeyDown);

    return () => {
      EventEmitter.unSubscribe(Event.toggleQrCode, handleKeyDown);
    };
  }, [isShowComponent]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        backgroundColor: '#2e2e2e',
        borderRadius: `0 20px 0 0`,
        display: isShowComponent ? 'grid' : 'none',
        flexDirection: 'column',
        padding: screenRatio * 40,
        gap: screenRatio * 40,
        zIndex: 3,
        fontSize: screenRatio * 14,
        lineHeight: 1.4,
        color: '#ffffff',
      }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: screenRatio * 100,
          width: '100%',
        }}>
        <Image
          src={'/feralfile-logo.svg'}
          alt="FF logo"
          width={screenRatio * 224}
          height={screenRatio * 23}></Image>
      </div>
      <div
        style={{
          fontSize: screenRatio * 20,
        }}>
        <div
          style={{
            // borderBottom: '1px solid #ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            paddingBottom: screenRatio * 10,
          }}>
          <p>{t('today_daily')}</p>
          <p
            style={{
              color: '#A0A0A0',
            }}>
            {t('next_work')}: {Math.floor(nextArtwork)}
            {t('hour')}
          </p>
        </div>
        <div
          style={{
            height: screenRatio,
            width: '100%',
            backgroundColor: '#4a4a4a',
          }}>
          <div
            style={{
              height: screenRatio,
              width: `${countdownPercentage.toString()}%`,
              backgroundColor: '#ffffff',
            }}></div>
        </div>
        <div style={{ paddingTop: screenRatio * 15 }}>
          {currentDaily?.token?.asset.metadata.project.latest.artistName && (
            <p>
              {currentDaily.token.asset.metadata.project.latest.artistName +
                ','}
            </p>
          )}
          {currentDaily?.token?.asset.metadata.project.latest.title && (
            <p
              style={{
                fontStyle: 'italic',
                fontWeight: 'bold',
              }}>
              {currentDaily.token.asset.metadata.project.latest.title}
            </p>
          )}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gap: screenRatio * 20,
          gridTemplateColumns: 'auto 1fr',
          alignItems: 'flex-end',
          fontSize: screenRatio * 20,
        }}>
        {branchLink ? (
          <QRCode
            value={branchLink}
            size={screenRatio * 194}
            bgColor={'#2e2e2e'}
            fgColor={'#ffffff'}></QRCode>
        ) : (
          <div style={{ width: screenRatio * 194, height: screenRatio * 194 }}>
            <QrCodeSkeleton />
          </div>
        )}
        <div style={{ width: screenRatio * 500 }}>
          <p style={{ width: '60%' }}>{t('get_the_Feral_File')}</p>
        </div>
      </div>
      <div
        style={{ fontSize: screenRatio * 20 }}
        className={styles['bottom-groups']}>
        <p>{t('press_enter_to_hide_show')}</p>
      </div>
    </div>
  );
};

export default QrCodePopUp;
