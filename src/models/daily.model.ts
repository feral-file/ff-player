import { Artwork } from './artwork.model';
import { IndexerToken } from './token.model';

export interface Daily {
  id: string;
  blockchain: string;
  contractAddress: string;
  displayTime: string;
  note: string;
  tokenID: string;
  tokenIDs: string[];
  tokenName?: string;
  previewURL?: string;
  token?: IndexerToken;
  artwork?: Artwork;
}
