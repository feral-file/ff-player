import { Blockchain } from './exhibition.model';

interface AssetAttributes {
  configuration?: AssetConfiguration;
}

interface ArtworkMetadata {
  isFeralfileFrame: boolean;
}

interface IndexerArtwork {
  title?: string;
  medium: string;
  previewURL: string;
  artworkMetadata?: ArtworkMetadata;
}

interface ProjectMetadata {
  latest: IndexerArtwork;
}

interface AssetMetadata {
  project: ProjectMetadata;
}

interface Asset {
  thumbnailID: string;
  staticPreviewURLLandscape?: string;
  staticPreviewURLPortrait?: string;
  attributes?: AssetAttributes;
  metadata: AssetMetadata;
}

export interface IndexerToken {
  id: string;
  contractAddress: string;
  indexID: string;
  source: string;
  asset?: Asset;
  blockchain?: Blockchain;
}

export interface AssetConfiguration {
  scaling?: string;
  backgroundColor?: string;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  autoPlay?: boolean;
  looping?: boolean;
  interactable?: boolean;
  overridable?: boolean;
}
