interface Owner {
  address: string;
  balance: number;
}

interface Provenance {
  type: string;
  owner: string;
  blockchain: string;
  blockNumber: number;
  timestamp: string;
  txID: string;
  txURL: string;
}

interface AssetAttributes {
  scrollable: boolean;
}

interface Artist {
  artistID: string;
  artistName: string;
  artistURL: string;
  assetID: string;
  title: string;
  description: string;
  mimeType: string;
  medium: string;
  maxEdition: number;
  baseCurrency: string;
  basePrice: number;
  source: string;
  sourceURL: string;
  previewURL: string;
  thumbnailURL: string;
  galleryThumbnailURL: string;
  assetData: string;
  assetURL: string;
}

interface ProjectMetadata {
  origin: Artist;
  latest: Artist;
}

interface AssetMetadata {
  project: ProjectMetadata;
}

interface Asset {
  staticPreviewURLLandscape?: string;
  staticPreviewURLPortrait?: string;
  indexID: string;
  thumbnailID: string;
  lastRefreshedTime: string;
  attributes: AssetAttributes;
  metadata: AssetMetadata;
}

export interface IndexerToken {
  id: string;
  blockchain: string;
  fungible: boolean;
  contractType: string;
  contractAddress: string;
  edition: number;
  editionName: string;
  mintedAt: string;
  mintAt: string;
  balance: number;
  owner: string;
  owners: Owner[];
  indexID: string;
  source: string;
  swapped: boolean;
  burned: boolean;
  lastActivityTime: string;
  provenance: Provenance[];
  lastRefreshedTime: string;
  asset: Asset;
}
