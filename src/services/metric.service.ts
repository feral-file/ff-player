import { LocalStorageItem } from '@/constants';
import axios, { AxiosInstance } from 'axios';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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

export function uploadNewMetric(
  event: CastingArtworkType,
  tokenID: string,
  duration: number, // At milliseconds
  retriedTimes = 0
) {
  const deviceID = localStorage.getItem(LocalStorageItem.deviceId);
  console.log(
    'METRIC TRACKING',
    event,
    tokenID,
    duration,
    deviceID,
    retriedTimes
  );

  if (retriedTimes >= MAX_RETRIES) {
    return;
  }

  if (!deviceID) {
    setTimeout(() => {
      uploadNewMetric(event, tokenID, duration, retriedTimes + 1);
    }, RETRY_DELAY_MS);
    return;
  }

  accountsRequester.defaults.headers['x-device-id'] = deviceID;
  accountsRequester
    .post('/apis/metrics', {
      event,
      timestamp: new Date().toISOString(),
      parameters: {
        duration: Math.floor((duration || 0) / 1000),
        tokenID,
      },
    })
    .catch((error: unknown) => {
      console.error('Error uploading metric', error);
    });
}
