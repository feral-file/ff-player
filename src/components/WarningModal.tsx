'use client';

import MessageModal from './MessageModal';
import { useEffect, useState, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { WatchdogEvent, WatchdogEventDetail } from '@/models';
import { AppSettings } from '@/constants';

export default function WarningModal() {
  const { context } = useAppContext();
  const { screenRatio } = context.deviceRotation ?? { screenRatio: 1 };
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const onWatchdogEvent = (event: Event) => {
      const watchdogEvent = event as CustomEvent<WatchdogEventDetail>;
      console.log(
        '[WarningModal] Watchdog event received:',
        watchdogEvent.detail.event
      );

      switch (watchdogEvent.detail.event) {
        case WatchdogEvent.CriticalCPUTemperature: {
          console.log('[WarningModal] Critical CPU temperature');
          setTitle('System Overheating Detected');
          setCountdown(AppSettings.WATCHDOG_COUNTDOWN_DURATION);
          break;
        }

        default: {
          console.log('[WarningModal] Unknown watchdog event');
          break;
        }
      }
    };

    window.addEventListener('watchdogEvent', onWatchdogEvent);

    return () => {
      window.removeEventListener('watchdogEvent', onWatchdogEvent);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Handle countdown and message updates
  useEffect(() => {
    if (countdown > 0) {
      setMessage(
        `Your device is overheating and will automatically shut down in ${String(countdown)} seconds to prevent damage`
      );

      intervalRef.current = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      console.log('[WarningModal] Countdown finished - shutting down');
      // Reset after countdown finishes
      setTitle('');
      setMessage('');
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [countdown]);

  return message ? (
    <div>
      <MessageModal screenRatio={screenRatio} title={title} message={message} />
    </div>
  ) : (
    <></>
  );
}
