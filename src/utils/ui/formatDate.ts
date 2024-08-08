import { format } from "date-fns";

export const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);

  const formattedDate = format(date, "EEEE, MMM d, yyyy"); // Example: "Friday, Mar 1, 2024"
  const formattedTime = format(date, "HH:mm"); // Example: "19:00"

  return {
    date: formattedDate,
    time: formattedTime,
  };
};
