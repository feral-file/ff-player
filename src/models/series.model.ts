import { Artwork, ArtworkModel } from './artwork.model';
import { User } from './user.model';

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
  artist: User;

  // Custom fields
  firstArtwork?: Artwork;
}

export interface Settings {
  artworkModel?: ArtworkModel;
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
