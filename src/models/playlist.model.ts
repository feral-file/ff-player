import { Artwork, IndexerToken } from '.';

export interface PlaylistToken {
  artwork?: Artwork;
  duration: number;
  previewURL: string;
  contractAddress?: string;
  token: {
    id: string;
  };
  indexerToken?: IndexerToken;
}
