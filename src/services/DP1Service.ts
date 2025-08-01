import { DP1Item } from '@/models/dp1.model';
import { convertToTokenID } from '@/utils/indexer';
import { IndexerService } from './IndexerService';

export const DP1Service = {
  async getItemPreviewURL(item: DP1Item): Promise<string | null> {
    if (item.source) {
      return item.source;
    }

    if (item.provenance?.contract) {
      const tokenId = convertToTokenID(
        item.provenance.contract.chain,
        item.provenance.contract.address,
        item.provenance.contract.tokenId
      );

      const token = await IndexerService.queryIndexerToken(tokenId);
      if (token) {
        return await IndexerService.getIndexerTokenPreview(token);
      }
    }

    return null;
  },
};
