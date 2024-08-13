import axios from 'axios';
import { Daily } from '../utils/types';

class DailyService {
  public async getUpcomingDaily(): Promise<Daily[]> {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/dailies/upcoming`
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Daily[];
  }
}

export default DailyService;
