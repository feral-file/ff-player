import { DP1Call, DP1Item } from '@/models/dp1.model';
import { convertToTokenID } from '@/utils/indexer';
import { IndexerService } from './IndexerService';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';
import { DEFAULT_PLAYLIST_URL } from '@/constants';

export const DP1Service = {
  async getItemInfo(item: DP1Item): Promise<{
    preview: string | null;
    owner: string | null;
  } | null> {
    if (item.provenance?.contract) {
      const tokenId = convertToTokenID(
        item.provenance.contract.chain,
        item.provenance.contract.address,
        item.provenance.contract.tokenId
      );

      const token = await IndexerService.queryIndexerToken(tokenId);
      if (token) {
        const preview = await IndexerService.getIndexerTokenPreview(token);
        return {
          preview,
          owner: token.owner ?? null,
        };
      }
    }

    return {
      preview: item.source,
      owner: null,
    };
  },

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
