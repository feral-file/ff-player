import { Daily } from '@/models';
import { NEW_DAILY_HOUR } from '@/utils/constants';

export const getDelayTime = (
  dailies: Daily[]
): { delay: number; duration: number } => {
  const now = Date.now();

  // Set display time to 6:00 AM
  const currentDisplayTime = new Date(dailies[0].displayTime);
  currentDisplayTime.setHours(NEW_DAILY_HOUR, 0, 0, 0);

  let nextDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() + 1
  );

  const previousDisplayTime = new Date(dailies[0].displayTime).getTime();

  return {
    delay: nextDisplayTime - now,
    duration: nextDisplayTime - previousDisplayTime,
  };
};
