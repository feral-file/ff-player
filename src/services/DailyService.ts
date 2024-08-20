import { IndexerToken } from '@/models';
import { Daily } from '../utils/types';
import ArtworkService from './ArtworkService';
import axiosInstance from './axiosService';

class DailyService {
  private artworkService = new ArtworkService();

  public async getUpcomingDaily(): Promise<Daily[]> {
    const response = await axiosInstance.get('/api/dailies/upcoming');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Daily[];
  }

  public async callingDailies(): Promise<Daily[]> {
    try {
      const dailies = await this.getUpcomingDaily();
      const ids = dailies.map((d: Daily) => {
        return this.getTokenID(d);
      });

      if (ids.length === 0) {
        return [];
      }

      const data = await this.artworkService.queryTokens(ids);
      const previewData = new Map<string, string>();
      data.forEach((token: IndexerToken) => {
        previewData.set(
          token.id,
          token.asset.metadata.project.latest.previewURL
        );
      });

      const indexerData = new Map<string, IndexerToken>();
      data.forEach((token: IndexerToken) => {
        indexerData.set(token.id, token);
      });

      const convertDailies = dailies.map((d: Daily) => {
        return {
          ...d,
          previewURL: previewData.get(d.tokenID),
          token: indexerData.get(d.tokenID),
        };
      });

      return convertDailies;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private getTokenID(d: Daily): string {
    switch (d.blockchain) {
      case 'ethereum': {
        return `eth-${d.contractAddress}-${d.tokenID}`;
      }

      case 'bitmark': {
        return `bmk--${d.tokenID}`;
      }

      case 'tezos': {
        return `tez-${d.contractAddress}-${d.tokenID}`;
      }

      default: {
        return '';
      }
    }
  }
}

export default DailyService;

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DailyInstanceService {
  private static instance: DailyInstanceService | null = null;
  private static dailies: Daily[] = [];

  public static getInstance(): DailyInstanceService {
    if (!DailyInstanceService.instance) {
      DailyInstanceService.instance = new DailyInstanceService();
    }

    return DailyInstanceService.instance;
  }

  public static getDailies() {
    return this.dailies;
  }

  public static setDailies(dailies: Daily[]) {
    this.dailies = dailies;
  }
}
