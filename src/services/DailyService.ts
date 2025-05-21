import { Daily, IndexerToken } from '@/models';
import ArtworkService from './ArtworkService';
import axiosInstance from './axiosService';
import { convertToTokenID, IndexerSource } from '@/utils/indexer';
import { convertToQueryParams } from '@/utils/queryParams';
import * as Sentry from '@sentry/nextjs';

class DailyService {
  private artworkService = new ArtworkService();
  static instance = new DailyService();
  private dailies: Daily[] = [];

  public getDailies(): Daily[] {
    return this.dailies;
  }

  public async refreshDailies(newDailyHour: number): Promise<void> {
    const newDailies = await this.callingDailies(newDailyHour);
    this.dailies = newDailies;
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

  public async callingDailies(newDailyHour: number): Promise<Daily[]> {
    try {
      const date = this.getCurrentLocaleDateOnly(newDailyHour);
      let dailies = await this.getDailiesByDate(date, [
        'includeSuccessfulSwap',
      ]);

      if (dailies.length === 0) {
        console.log('[DAILY] No upcoming dailies, using default daily');
        Sentry.captureMessage(
          '[DAILY] No upcoming dailies, using default daily'
        );
        dailies = [this.getDefaultDaily()];
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
          token.asset?.metadata.project.latest.previewURL ?? ''
        );
      });

      const indexerData = new Map<string, IndexerToken>();
      data.forEach((token: IndexerToken) => {
        indexerData.set(token.id, token);
      });

      const convertDailies = dailies.map((d: Daily) => {
        let tokenID = d.tokenID;
        if (d.artwork?.swap) {
          tokenID = d.artwork.swap.token;
        }
        const token = indexerData.get(tokenID);

        const previewURL =
          token?.source === IndexerSource.feral_file && d.artwork
            ? this.artworkService.getArtworkPreview(d.artwork)
            : previewData.get(tokenID);

        return {
          ...d,
          previewURL,
          token,
        };
      });

      return convertDailies;
    } catch (error) {
      console.error(
        '[DAILY] Error when convert dailies',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      return [this.getDefaultDaily()];
    }
  }

  public async getPreviewURLs(
    tokenID: string,
    daily: Daily
  ): Promise<string[] | null> {
    let { blockchain, contractAddress } = daily;
    try {
      const artwork = await this.artworkService.getArtworkDetail(
        tokenID,
        false,
        true
      );
      if (artwork?.successfulSwap) {
        blockchain = artwork.successfulSwap.blockchainType;
        contractAddress = artwork.successfulSwap.contractAddress;
        tokenID = artwork.successfulSwap.token;
      }
    } catch {
      console.log(
        'Artwork with ID:',
        tokenID,
        'not found from Feral File, start query indexer.'
      );
    }

    const id = convertToTokenID(blockchain, contractAddress, tokenID);
    const token = await this.artworkService.queryIndexerToken(id);
    if (!token) {
      throw new Error('Token not found');
    }

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

  private getDefaultDaily(): Daily {
    // Payphone Token
    return {
      blockchain: 'ethereum',
      contractAddress: '0x1D9787369B1DCf709f92Da1d8743c2A4b6028a83',
      displayTime: new Date().toString(),
      id: '',
      tokenName: '#1',
      tokenID: '339348595130070749814751437599411258966098496',
      tokenIDs: ['339348595130070749814751437599411258966098496'],
      note: '',
    };
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

export default DailyService.instance;
