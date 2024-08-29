import { Daily } from '@/models';

export const getDelayTime = (
  dailies: Daily[]
): { delay: number; duration: number } => {
  const now = Date.now();
  const currentDisplayTime = new Date(dailies[0].displayTime);
  let nextDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() + 1
  );
  if (dailies.length > 1 && dailies[1].displayTime) {
    nextDisplayTime = new Date(dailies[1].displayTime).getTime();
  }

  const previousDisplayTime = new Date(dailies[0].displayTime).getTime();

  return {
    delay: nextDisplayTime - now,
    duration: nextDisplayTime - previousDisplayTime,
  };
};
