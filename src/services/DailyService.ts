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
      let dailies = await this.getUpcomingDaily(
        ['includeSuccessfulSwap'],
        'limit=10&offset=0'
      );

      if (dailies.length === 0) {
        dailies = [this.getDefaultDaily()];
      }

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
        let tokenID = d.tokenID;
        if (d.artwork?.swap) {
          tokenID = d.artwork.swap.token;
        }
        const token = indexerData.get(tokenID);
        if (token) {
          tokenName = getIndexerTokenName(token);
        }

        return {
          ...d,
          previewURL: previewData.get(tokenID),
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

  private getDefaultDaily(): Daily {
    // Payphone Token
    return {
      blockchain: 'ethereum',
      contractAddress: '0x1D9787369B1DCf709f92Da1d8743c2A4b6028a83',
      displayTime: new Date().setHours(0, 0, 0, 0).toString(),
      id: '',
      tokenName: '#1',
      tokenID: '339348595130070749814751437599411258966098496',
    };
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
