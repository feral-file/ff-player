// import { Daily } from '@/utils/types';

import { Daily } from '@/utils/types';
import { useEffect, useRef, useState } from 'react';
import DailyService, { DailyInstanceService } from './DailyService';

const useDailies = () => {
  const dailyService = useRef(new DailyService());
  const [dailies, setDailies] = useState<Daily[]>([]);

  useEffect(() => {
    const fetchDailies = async () => {
      let dailies = DailyInstanceService.getDailies();
      if (dailies.length === 0) {
        dailies = await dailyService.current.callingDailies();
      }
      setDailies(dailies);
    };

    fetchDailies().catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  return dailies;
};

export default useDailies;

export const getDelayTime = (dailies: Daily[]) => {
  const now = Date.now();
  const currentDisplayTime = new Date(dailies[0].displayTime);
  let nextDisplayTime = currentDisplayTime.setDate(
    currentDisplayTime.getDate() + 1
  );
  if (dailies.length > 1 && dailies[1].displayTime) {
    nextDisplayTime = new Date(dailies[1].displayTime).getTime();
  }

  return nextDisplayTime - now;
};
