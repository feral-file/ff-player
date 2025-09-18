import { DP1Item } from '@/models/dp1.model';
import { convertToTokenID } from '@/utils/indexer';
import { IndexerService } from './IndexerService';

export const DP1Service = {
  async getItemPreviewURL(item: DP1Item): Promise<{
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
      console.log('[DP1Service] token', token);
      if (token) {
        const preview = await IndexerService.getIndexerTokenPreview(token);
        return {
          preview,
          owner: token.owner ?? null,
        };
      }
    }

    return {
      preview: item.source ?? null,
      owner: null,
    };
  },
};
