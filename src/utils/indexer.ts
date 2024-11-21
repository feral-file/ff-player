import { Artwork, Blockchain, Exhibition, IndexerToken } from '@/models';

export enum IndexerSource {
  feral_file = 'feralfile',
}

export const getIndexerTokenName = (token: IndexerToken): string => {
  try {
    const getTitle = (token: IndexerToken): string => {
      return token.asset.metadata.project.latest.title.trim() || '';
    };

    const getMintedYear = (token: IndexerToken): string => {
      const mintedAt = token.mintedAt || token.mintAt;
      if (mintedAt) {
        const date = new Date(mintedAt);
        return ` (${date.getFullYear().toString()})`;
      }
      return '';
    };

    const getEditionName = (token: IndexerToken): string => {
      if (token.source === (IndexerSource.feral_file as string)) {
        return ` ${token.editionName}`;
      }
      return '';
    };

    const title = getTitle(token);
    const mintedYear = getMintedYear(token);
    const editionName = getEditionName(token);
    return `${title}${mintedYear}${editionName}`;
  } catch (error) {
    console.log(error);
    return '';
  }
};

export function convertToTokenID(
  blockchain: string,
  contractAddress: string,
  tokenID: string
): string {
  switch (blockchain) {
    case 'ethereum': {
      return `eth-${contractAddress}-${tokenID}`;
    }

    case 'bitmark': {
      return `bmk--${tokenID}`;
    }

    case 'tezos': {
      return `tez-${contractAddress}-${tokenID}`;
    }

    default: {
      return '';
    }
  }
}

export function formatArtworkIndexID(artwork: Artwork, exhibition: Exhibition) {
  let contractAddress: string;
  let blockchain: string;
  let tokenID = artwork.id ?? '';
  if (exhibition.mintBlockchain === Blockchain.Bitmark && artwork.swap) {
    contractAddress = artwork.swap.contractAddress;
    blockchain = artwork.swap.blockchainType;
    tokenID = artwork.swap.token;
  } else {
    contractAddress = exhibition.contracts?.[0]?.address ?? '';
    blockchain = exhibition.mintBlockchain ?? '';
  }

  return convertToTokenID(blockchain, contractAddress, tokenID);
}
