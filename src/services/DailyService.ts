import { Daily, IndexerToken } from '@/models';
import { artworkService } from './ArtworkService';
import axiosInstance from './axiosService';
import { convertToTokenID, IndexerSource } from '@/utils/indexer';
import { convertToQueryParams } from '@/utils/queryParams';
import * as Sentry from '@sentry/nextjs';
import { IndexerService } from './IndexerService';
import { DEFAULT_DAILY } from '@/constants';

class DailyService {
  private daily: Daily | null = null;
  private static instance: DailyService | null = null;

  public static getInstance(): DailyService {
    if (!DailyService.instance) {
      DailyService.instance = new DailyService();
    }
    return DailyService.instance;
  }

  public getDaily(): Daily | null {
    return this.daily;
  }

  public async refreshDailies(newDailyHour: number): Promise<void> {
    this.daily = await this.getFirstDaily(newDailyHour);
  }

  public getNextDailyDelay(newDailyHour: number): number {
    const now = Date.now();

    const nextDailyDisplayTime = new Date();
    nextDailyDisplayTime.setHours(newDailyHour, 0, 0, 0);

    // If current time has passed today's display time, move to next day
    if (now > nextDailyDisplayTime.getTime()) {
      nextDailyDisplayTime.setDate(nextDailyDisplayTime.getDate() + 1);
    }

    return nextDailyDisplayTime.getTime() - now;
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

  public async getFirstDaily(newDailyHour: number): Promise<Daily | null> {
    try {
      let firstDaily: Daily;
      const date = this.getCurrentLocaleDateOnly(newDailyHour);
      const dailies = await this.getDailiesByDate(date, [
        'includeSuccessfulSwap',
      ]);

      if (dailies.length === 0) {
        console.log('[DAILY] No upcoming dailies, using default daily');
        Sentry.captureMessage(
          '[DAILY] No upcoming dailies, using default daily'
        );
        firstDaily = DEFAULT_DAILY;
      } else {
        firstDaily = dailies[0];
      }

      return await this.getFullDailyInfo(firstDaily);
    } catch (error) {
      console.error(
        '[DAILY] Error when convert dailies',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      return await this.getFullDailyInfo(DEFAULT_DAILY);
    }
  }

  private async getFullDailyInfo(daily: Daily): Promise<Daily> {
    const indexerTokenID = await this.getDailyIndexerTokenID(
      daily.tokenID,
      daily
    );

    if (!indexerTokenID) {
      return daily;
    }

    const token = await IndexerService.queryIndexerToken(indexerTokenID);
    if (!token) {
      return daily;
    }

    const previewURL =
      token.source === IndexerSource.feral_file.toString() && daily.artwork
        ? await artworkService.getArtworkPreview(daily.artwork)
        : await IndexerService.getIndexerTokenPreview(token);

    return {
      ...daily,
      previewURL,
      token,
      indexerTokenID,
      contractAddress:
        daily.artwork?.successfulSwap?.contractAddress ?? daily.contractAddress,
    };
  }

  public async getDailyIndexerTokenID(
    tokenID: string,
    daily: Daily
  ): Promise<string> {
    let { blockchain, contractAddress } = daily;
    let artwork = daily.artwork ?? null;
    if (!artwork) {
      try {
        artwork = await artworkService.getArtworkDetail(tokenID, false, true);
      } catch {
        console.log('[DAILY] Artwork not found');
      }
    }

    if (artwork?.successfulSwap) {
      blockchain = artwork.successfulSwap.blockchainType;
      contractAddress = artwork.successfulSwap.contractAddress;
      tokenID = artwork.successfulSwap.token;
    }

    return convertToTokenID(blockchain, contractAddress, tokenID);
  }

  public getPreviewURLs(token: IndexerToken): string[] | null {
    if (!token.asset) {
      return null;
    }

    return token.asset.staticPreviewURLLandscape &&
      token.asset.staticPreviewURLPortrait
      ? [
          token.asset.staticPreviewURLLandscape + '/raw',
          token.asset.staticPreviewURLPortrait + '/raw',
        ]
      : token.asset.metadata.project.latest.medium === 'image' &&
          token.asset.metadata.project.latest.previewURL
        ? [
            token.asset.metadata.project.latest.previewURL,
            token.asset.metadata.project.latest.previewURL,
          ] // Use the same image for both landscape and portrait
        : null;
  }

  private getCurrentLocaleDateOnly(newDailyHour: number): string {
    const now = new Date();
    let currentTimestamp: number;
    // Previous day if the current time is before 6:00 AM
    const newDailyAt = new Date().setHours(newDailyHour, 0, -1, 0); // 5:59:59 AM buffer 1s
    if (now.getTime() < newDailyAt) {
      currentTimestamp = now.setDate(now.getDate() - 1);
    } else {
      currentTimestamp = now.getTime();
    }

    const date = new Date(currentTimestamp);
    // Format date to yyyy-mm-dd
    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export default DailyService.getInstance();
