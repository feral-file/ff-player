import { Daily } from '@/models';

export const getDelayTime = (
  dailies: Daily[],
  newDailyHour: number
): { delay: number; duration: number } => {
  const now = Date.now();

  // Set display time to 6:00 AM
  const currentDisplayTime = new Date();
  currentDisplayTime.setDate(new Date(dailies[0].displayTime).getUTCDate());
  currentDisplayTime.setHours(newDailyHour, 0, 0, 0);

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
