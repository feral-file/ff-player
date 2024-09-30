export const getDelayTime = (
  dailyDisplayTime: string,
  newDailyHour: number
): { delay: number; duration: number } => {
  const now = Date.now();
  const displayDateInUTC = new Date(dailyDisplayTime).toISOString();
  const expectedDateOnly = displayDateInUTC.split('T')[0];

  // Set hours to 6:00 AM for the expected date only
  const currentDisplayTime = new Date(expectedDateOnly); // Expected date only in local timezone
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
