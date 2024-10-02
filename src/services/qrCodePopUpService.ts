export const getDelayTime = (
  newDailyHour: number
): { delay: number; duration: number } => {
  const now = Date.now();
  let nextDisplayTime: number;

  const dailyRenewAt = new Date();
  dailyRenewAt.setHours(newDailyHour, 0, 0, 0); // Reset daily time every day

  // If after 6AM
  if (now > dailyRenewAt.getTime()) {
    nextDisplayTime = dailyRenewAt.setDate(dailyRenewAt.getDate() + 1);
  } else {
    nextDisplayTime = dailyRenewAt.getTime();
  }

  return {
    delay: nextDisplayTime - now,
    duration: 86400000, // 24 hours
  };
};
