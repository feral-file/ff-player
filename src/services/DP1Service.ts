import { DP1Call } from '@/models/dp1.model';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export const DP1Service = {
  async getPlaylist(playlistURL: string): Promise<DP1Call | null> {
    try {
      console.log('[DP1Service] Fetching playlist from:', playlistURL);

      const response = await axios.get<DP1Call>(playlistURL);

      console.log('[DP1Service] Playlist fetched successfully');
      return response.data;
    } catch (error) {
      console.error('[DP1Service] Failed to load playlist:', error);
      Sentry.captureException(error);
      return null;
    }
  },
};
