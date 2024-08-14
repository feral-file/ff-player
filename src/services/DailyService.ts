import { Daily } from '../utils/types';
import axiosInstance from './axiosService';

class DailyService {
  public async getUpcomingDaily(): Promise<Daily[]> {
    const response = await axiosInstance.get('/api/dailies/upcoming');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Daily[];
  }
}

export default DailyService;
