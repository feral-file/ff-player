'use client';

import MessageModal from './MessageModal';
import { useEffect, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { WatchdogEvent, WatchdogEventDetail } from '@/models';
import { LocalStorageItem } from '@/constants';

export default function WarningModal() {
  const { context } = useAppContext();
  const { screenRatio } = context.deviceRotation ?? { screenRatio: 1 };
  const [message, setMessage] = useState<string>('');
  const [title, setTitle] = useState<string>('');

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
          localStorage.setItem(LocalStorageItem.criticalTemp, 'true');
          setTitle('System Overheating Detected');
          setMessage(
            `The device temperature has exceeded safe operating levels. To prevent damage, playback will be paused. Please reboot the device to continue viewing the artwork.`
          );
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
    };
  }, []);

  return message ? (
    <div>
      <MessageModal screenRatio={screenRatio} title={title} message={message} />
    </div>
  ) : (
    <></>
  );
}
