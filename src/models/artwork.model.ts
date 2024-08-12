import { Series } from "./series.model";

export enum ArtworkModel {
  multi = "multi",
  single = "single",
  multi_unique = "multi_unique",
  unknown = "unknown",
}

export interface Artwork {
  id?: string;
  seriesID?: string;
  index?: number;
  name?: string;
  previewURI?: string;
  thumbnailURI?: string;
  series?: Series;
  metadata?: ArtworkMetadata;
}

interface ArtworkMetadata {
  previewCloudFlareURL?: string;
  thumbnailCloudFlareURL?: string;
  alternativePreviewURI?: string;
  viewableAt?: string;
  ts044MergedIndexes?: number[];
}
