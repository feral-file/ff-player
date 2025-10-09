import { DP1Call } from '@/models/dp1.model';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';
import { DEFAULT_PLAYLIST_URL } from '@/constants';

export const DP1Service = {
  async getDefaultPlaylist(): Promise<DP1Call | null> {
    try {
      console.log(
        '[DP1Service] Fetching default playlist from:',
        DEFAULT_PLAYLIST_URL
      );

      const response = await axios.get<DP1Call>(DEFAULT_PLAYLIST_URL);

      console.log('[DP1Service] Default playlist fetched successfully');
      return response.data;
    } catch (error) {
      console.error('[DP1Service] Failed to load default playlist:', error);
      Sentry.captureException(error);
      return null;
    }
  },
};
