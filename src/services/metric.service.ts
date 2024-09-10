import { LocalStorageItem } from '@/constants';
import axios, { AxiosInstance } from 'axios';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export enum CastingArtworkType {
  Unknown = 'UNKNOWN',
  Daily = 'DAILY_DISPLAY',
  Playlist = 'PLAYLIST_DISPLAY',
  Exhibition = 'EXHIBITION_DISPLAY',
}

const accountsRequester: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
  headers: {
    'x-api-key': process.env.NEXT_PUBLIC_ACCOUNTS_API_KEY,
  },
});

export async function uploadNewMetric(
  event: CastingArtworkType,
  tokenID: string,
  retriedTimes = 0
): Promise<void> {
  console.log('METRIC TRACKING', event, tokenID, retriedTimes);

  const deviceID = localStorage.getItem(LocalStorageItem.deviceId);
  if (retriedTimes >= MAX_RETRIES) {
    return;
  }

  if (!deviceID) {
    console.warn('Device ID not found. Retrying...');
    setTimeout(() => {
      uploadNewMetric(event, tokenID, retriedTimes + 1).catch(
        (error: unknown) => {
          console.error(error);
        }
      );
    }, RETRY_DELAY_MS);
    return;
  }

  accountsRequester.defaults.headers['x-device-id'] = deviceID;
  try {
    await accountsRequester.post('/apis/metrics', {
      event,
      timestamp: new Date().toISOString(),
      parameters: {
        tokenID,
      },
    });
  } catch (error) {
    console.error('Error uploading metric', error);
    setTimeout(() => {
      uploadNewMetric(event, tokenID, retriedTimes + 1).catch(
        (error: unknown) => {
          console.error(error);
        }
      );
    }, RETRY_DELAY_MS);
  }
}
