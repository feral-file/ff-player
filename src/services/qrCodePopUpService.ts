export const getDelayTime = (
  dailyDisplayTime: string,
  newDailyHour: number
): { delay: number; duration: number } => {
  const now = Date.now();
  const localDate = dailyDisplayTime.split('Z')[0]; // Remove timezone

  const currentDisplayTime = new Date(localDate); // Parse string to local time
  currentDisplayTime.setHours(newDailyHour, 0, 0, 0);

  const nextDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() + 1
  );

  return {
    delay: nextDisplayTime - now,
    duration: 86400000, // 24 hours
  };
};
