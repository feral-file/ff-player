import { DP1Item } from '@/models/dp1.model';
import { convertToTokenID } from '@/utils/indexer';
import { indexerService } from './IndexerService';

class DP1Service {
  async getItemPreviewURL(item: DP1Item): Promise<string | null> {
    if (item.provenance?.contract) {
      const tokenId = convertToTokenID(
        item.provenance.contract.chain,
        item.provenance.contract.address,
        item.provenance.contract.tokenId
      );

      const token = await indexerService.queryIndexerToken(tokenId);
      if (token) {
        return await indexerService.getIndexerTokenPreview(token);
      }
    }

    return item.source ?? null;
  }
}

export const dp1Service = new DP1Service();
