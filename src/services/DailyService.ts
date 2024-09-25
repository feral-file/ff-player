import { Daily, IndexerToken } from '@/models';
import ArtworkService from './ArtworkService';
import axiosInstance from './axiosService';
import { convertToTokenID, getIndexerTokenName } from '@/utils/indexer';
import { convertToQueryParams } from '@/utils/queryParams';

class DailyService {
  private artworkService = new ArtworkService();
  static instance = new DailyService();
  private dailies: Daily[] = [];

  public getDailies(): Daily[] {
    return this.dailies;
  }

  public async isRefreshDailies(newDailyHour: number): Promise<boolean> {
    const newDailies = await this.callingDailies(newDailyHour);
    if (newDailies !== this.dailies) {
      this.dailies = newDailies;
      return true;
    }

    return false;
  }

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

  public async getDailiesByDate(
    date: string,
    expand?: string[]
  ): Promise<Daily[]> {
    let expandParams = '';
    if (expand) {
      expandParams = convertToQueryParams(expand);
    }

    const response = await axiosInstance.get(
      `/api/dailies/date/${date}?${expandParams}`
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Daily[];
  }

  public async callingDailies(
    newDailyHour: number,
    nextNumberDay?: number
  ): Promise<Daily[]> {
    try {
      if (!nextNumberDay) {
        nextNumberDay = -1;
      }
      const date = this.getCurrentLocaleDateOnly(newDailyHour, nextNumberDay);
      let dailies = await this.getDailiesByDate(date, [
        'includeSuccessfulSwap',
      ]);

      if (dailies.length === 0) {
        console.log('[DAILY] No upcoming dailies, using default daily');
        dailies = [this.getDefaultDaily()];
        return [];
      }

      const ids = dailies.map((d: Daily) => {
        if (d.artwork?.swap) {
          const swap = d.artwork.swap;
          return convertToTokenID(
            swap.blockchainType,
            swap.contractAddress,
            swap.token
          );
        }

        return convertToTokenID(d.blockchain, d.contractAddress, d.tokenID);
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
      console.error(
        '[DAILY] Error when convert dailies',
        JSON.stringify(error)
      );
      return [this.getDefaultDaily()];
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

  private getCurrentLocaleDateOnly(
    newDailyHour: number,
    nextNumberDay: number
  ): string {
    const now = new Date();
    let currentTimestamp: number;
    if (nextNumberDay >= 0) {
      currentTimestamp = now.setDate(now.getDate() + nextNumberDay);
    } else {
      // Previous day if the current time is before 6:00 AM
      const newDailyAt = new Date().setHours(newDailyHour, 0, 0, 0); // 6:00 AM
      currentTimestamp = now.setDate(now.getDate() + nextNumberDay);
      if (now.getTime() < newDailyAt) {
        currentTimestamp = now.setDate(now.getDate() - 1);
      } else {
        currentTimestamp = now.getTime();
      }
    }

    const date = new Date(currentTimestamp);
    // Format date to yyyy-mm-dd
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    console.log('---Kien---', `${year}-${month}-${day}`);
    return `${year}-${month}-${day}`;
  }
}

export default DailyService.instance;
