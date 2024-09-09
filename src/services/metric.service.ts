import { LocalStorageItem } from '@/constants';
import axios, { AxiosInstance } from 'axios';

export enum CastingArtworkType {
  Unknown = 'Unknown',
  Daily = 'Daily',
  Playlist = 'Playlist',
  Exhibition = 'Exhibition',
}

const accountsRequester: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
  headers: {
    // 'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_ACCOUNTS_API_KEY,
  },
});

export function uploadNewMetric(
  event: CastingArtworkType,
  tokenID: string,
  duration: number // At milliseconds
) {
  const identifier = localStorage.getItem(LocalStorageItem.metricIdentifier);
  console.log('METRIC TRACKING', event, tokenID, duration, identifier);

  if (!identifier) {
    return;
  }

  accountsRequester.defaults.headers['x-device-id'] = identifier;
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
