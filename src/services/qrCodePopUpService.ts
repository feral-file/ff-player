import { Daily } from '@/models';

export const getDelayTime = (
  dailies: Daily[],
  newDailyHour: number
): { delay: number; duration: number } => {
  const now = Date.now();

  // Current display time is the date of daily and 6:00 AM
  const currentDisplayTime = new Date(); // Initial Date object
  currentDisplayTime.setDate(new Date(dailies[0].displayTime).getUTCDate()); // Set Date is the display date of daily
  currentDisplayTime.setHours(newDailyHour, 0, 0, 0); // Set time as configured new daily hour

  const nextDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() + 1
  );

  const previousDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() - 1
  );

  return {
    delay: nextDisplayTime - now,
    duration: nextDisplayTime - previousDisplayTime,
  };
};
