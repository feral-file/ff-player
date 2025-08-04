import { DP1Item } from '@/models/dp1.model';
import { convertToTokenID } from '@/utils/indexer';
import { IndexerService } from './IndexerService';

export const DP1Service = {
  async getItemPreviewURL(item: DP1Item): Promise<string | null> {
    if (item.provenance?.contract) {
      const tokenId = convertToTokenID(
        item.provenance.contract.chain,
        item.provenance.contract.address,
        item.provenance.contract.tokenId
      );

      const token = await IndexerService.queryIndexerToken(tokenId);
      console.log('[DP1Service] token', token);
      if (token) {
        return await IndexerService.getIndexerTokenPreview(token);
      }
    }

    return item.source ?? null;
  },
};
