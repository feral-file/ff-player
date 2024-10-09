import { TIMESTAMP_PER_HOUR, TIMESTAMP_PER_MINUTE } from '@/constants';
import { useAppContext } from '@/context/AppContext';
import { getDelayTime } from '@/services/qrCodePopUpService';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const NextDailyTimer = () => {
  const { context } = useAppContext();
  const newDailyHour = context.appRemoteConfig.new_daily_hour;
  const t = useTranslations('QrCodePopUp');

  const [nextDailyIn, setNextDailyIn] = useState<string>('');
  const [secondLeft, setSecondLeft] = useState<number>(3600);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getNextDaily = () => {
    const { delay } = getDelayTime(newDailyHour);
    const nextDailyRemind = formatRemainingTime(delay);
    setNextDailyIn(nextDailyRemind);
  };

  const formatRemainingTime = (delayTimestamp: number) => {
    const timestamp = delayTimestamp < 0 ? 0 : delayTimestamp;
    setSecondLeft(timestamp / 1000);
    const hours = Math.floor(timestamp / TIMESTAMP_PER_HOUR);

    let remainingTime = '';
    if (hours > 0) {
      remainingTime += `${hours.toString()}${t('hour')}`;
    } else {
      const minutes = Math.floor(timestamp / TIMESTAMP_PER_MINUTE);
      if (minutes > 1) {
        remainingTime += `${minutes.toString()} ${t('minutes')}`;
      } else {
        remainingTime += t('second');
      }
    }

    return remainingTime;
  };

  const setDynamicInterval = () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (secondLeft > 3600) {
      // If more than an hour is left, update every 10 minutes
      timerRef.current = setInterval(
        () => {
          getNextDaily();
        },
        10 * 60 * 1000
      );
    } else if (secondLeft <= 3600 && secondLeft > 60) {
      // If it's the last hour, update every minute
      timerRef.current = setInterval(() => {
        getNextDaily();
      }, 60 * 1000);
    } else if (secondLeft <= 60) {
      // If it's the last minute
      timerRef.current = setInterval(() => {
        getNextDaily();
      }, 2000);
    }
  };

  useEffect(() => {
    setDynamicInterval();

    if (secondLeft <= 0 && timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondLeft]);

  useEffect(() => {
    getNextDaily();
  }, [newDailyHour, getNextDaily]);

  return <>{nextDailyIn}</>;
};

export default NextDailyTimer;
