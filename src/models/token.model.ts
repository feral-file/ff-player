interface AssetAttributes {
  configuration?: AssetConfiguration;
}

interface IndexerArtwork {
  medium: string;
  previewURL: string;
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
