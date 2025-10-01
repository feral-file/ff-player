export enum IndexerSource {
  feral_file = 'feralfile',
}

export function convertToTokenID(
  blockchain: string,
  contractAddress: string,
  tokenID: string
): string {
  switch (blockchain) {
    case 'ethereum':
    case 'evm': {
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
