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
}
