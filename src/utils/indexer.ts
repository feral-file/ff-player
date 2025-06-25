import { SOURCE_EXHIBITION_ID } from '@/constants';
import { Artwork, Blockchain, Exhibition } from '@/models';

export enum IndexerSource {
  feral_file = 'feralfile',
}

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

  if (exhibition.id === SOURCE_EXHIBITION_ID) {
    return tokenID;
  }

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
