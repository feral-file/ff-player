'use client';

import { useEffect, useState } from 'react';

interface DP1ScheduleTimeoutSetEvent extends CustomEvent {
  detail: {
    scheduleTime: string;
  };
}

const ScheduleDisplay = () => {
  const [scheduleTime, setScheduleTime] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    const handleTimeoutSet = (event: DP1ScheduleTimeoutSetEvent) => {
      setScheduleTime(event.detail.scheduleTime);
      setIsVisible(true);
    };

    const handleTimeoutCleared = () => {
      setIsVisible(false);
      setScheduleTime(null);
      setCountdown('');
    };

    // Add event listeners
    window.addEventListener(
      'dp1ScheduleTimeoutSet',
      handleTimeoutSet as EventListener
    );
    window.addEventListener('dp1ScheduleTimeoutCleared', handleTimeoutCleared);

    // Cleanup
    return () => {
      window.removeEventListener(
        'dp1ScheduleTimeoutSet',
        handleTimeoutSet as EventListener
      );
      window.removeEventListener(
        'dp1ScheduleTimeoutCleared',
        handleTimeoutCleared
      );
    };
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!scheduleTime) return;

    const updateCountdown = () => {
      try {
        // Parse the scheduled date and time
        const scheduledDateTime = new Date(scheduleTime);
        const now = new Date();
        const timeDifference = scheduledDateTime.getTime() - now.getTime();

        if (timeDifference <= 0) {
          setCountdown('Now');
          return;
        }

        // Calculate days, hours, minutes, seconds
        const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor(
          (timeDifference % (1000 * 60 * 60)) / (1000 * 60)
        );
        const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

        // Format countdown string
        let countdownString = '';
        if (days > 0) {
          countdownString += `${String(days)}d `;
        }
        if (hours > 0 || days > 0) {
          countdownString += `${String(hours)}h `;
        }
        if (minutes > 0 || hours > 0 || days > 0) {
          countdownString += `${String(minutes)}m `;
        }
        countdownString += `${String(seconds)}s`;

        setCountdown(countdownString);
      } catch (error) {
        console.error('Error calculating countdown:', error);
        setCountdown('Invalid date');
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [scheduleTime]);

  if (!isVisible || !scheduleTime) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: 'black',
        padding: '10px',
        color: 'white',
      }}>
      There is a scheduled playlist that will begin in: {countdown}
    </div>
  );
};

export default ScheduleDisplay;
