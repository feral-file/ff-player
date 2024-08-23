import { Daily, IndexerToken } from '@/models';
import ArtworkService from './ArtworkService';
import axiosInstance from './axiosService';
import { getIndexerTokenName } from '@/utils/indexer';
import { convertToQueryParams } from '@/utils/queryParams';

class DailyService {
  private artworkService = new ArtworkService();

  public async getUpcomingDaily(
    expand: string[],
    pagingParams?: string
  ): Promise<Daily[]> {
    const expandParams = convertToQueryParams(expand);
    const response = await axiosInstance.get(
      `/api/dailies/upcoming?${expandParams}&${pagingParams ?? ''}`
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Daily[];
  }

  public async callingDailies(): Promise<Daily[]> {
    try {
      const dailies = await this.getUpcomingDaily(
        ['includeArtwork'],
        'limit=10&offset=0'
      );
      const ids = dailies.map((d: Daily) => {
        if (d.artwork?.swap) {
          const swap = d.artwork.swap;
          return this.convertToTokenID(
            swap.blockchainType,
            swap.contractAddress,
            swap.token
          );
        }

        return this.convertToTokenID(
          d.blockchain,
          d.contractAddress,
          d.tokenID
        );
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
        let tokenName = '';
        const token = indexerData.get(d.tokenID);
        if (token) {
          tokenName = getIndexerTokenName(token);
        }
        return {
          ...d,
          previewURL: previewData.get(d.tokenID),
          token,
          tokenName,
        };
      });

      return convertDailies;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  private convertToTokenID(
    blockchain: string,
    contractAddress: string,
    tokenID: string
  ): string {
    switch (blockchain) {
      case 'ethereum': {
        return `eth-${contractAddress}-${tokenID}`;
      }

      case 'bitmark': {
        return `bmk--${tokenID}`;
      }

      case 'tezos': {
        return `tez-${contractAddress}-${tokenID}`;
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
