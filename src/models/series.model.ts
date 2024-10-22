import { Artwork, ArtworkModel } from './artwork.model';
import { Alumni } from './user.model';

export enum SaleModel {
  Shopping = 'shopping',
  EnglishAuction = 'english_auction',
  DutchAuction = 'dutch_auction',
  Airdrop = 'airdrop',
  ShoppingAirdrop = 'shopping_airdrop',
  ReverseDutchAuction = 'reverse_dutch_auction',
}

export interface Series {
  id: string;
  onchainID: string;
  exhibitionID: string;
  title: string;
  medium?: string;
  description?: string;
  artistID?: string;
  artistName?: string;
  displayIndex: number;
  settings?: Settings;
  uniqueThumbnailPath?: string;
  uniquePreviewPath?: string;
  thumbnailURI?: string;
  previewFile?: FileInfo;
  artworks?: Artwork[];
  metadata?: SeriesMetadata;
  artist: Alumni;

  // Custom fields
  firstArtwork?: Artwork;
}

export interface Settings {
  artworkModel?: ArtworkModel;
  saleModel?: SaleModel;
}

export interface FileInfo {
  filename?: string;
  uri?: string;
  status?: string;
  version?: string;
}

interface SeriesMetadata {
  mediumDescription: string[];
}
