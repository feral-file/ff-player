import { Metadata } from "next";
import { Artwork, ArtworkModel } from "./artwork.model";

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
  metadata?: Metadata;

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
