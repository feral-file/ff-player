import { Series } from './series.model';

export enum ArtworkModel {
  multi = 'multi',
  single = 'single',
  multi_unique = 'multi_unique',
  unknown = 'unknown',
}

export interface Artwork {
  id?: string;
  seriesID?: string;
  index?: number;
  name?: string;
  previewURI?: string;
  previewDisplay?: {
    HLS?: string;
    DASH?: string;
  };
  previewMIMEType?: string;
  thumbnailURI?: string;
  mintedAt?: string;
  series?: Series;
  metadata?: ArtworkMetadata;
  artistAlias?: string;
  swap?: Swap;
}

interface ArtworkMetadata {
  previewCloudFlareURL?: string;
  thumbnailCloudFlareURL?: string;
  alternativePreviewURI?: string;
  viewableAt?: string;
  ts044MergedIndexes?: number[];
}

export interface Swap {
  id: string;
  blockchainType: string;
  contractAddress: string;
  token: string;
}
