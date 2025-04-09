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
  successfulSwap?: Swap;
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

// Artwork Preview
export enum PreviewHTMLTag {
  iframe = 'iframe',
  iframePDF = 'iframePDF',
  object = 'object',
  video = 'video',
  audio = 'audio',
  image = 'image',
  stream = 'stream',
}
export const FileUseIframePDF: string[] = ['pdf', 'application/pdf'];
export const FileUseObject: string[] = ['txt'];
export const FileUseVideo: string[] = [
  'mp4',
  'mov',
  'wmv',
  'quicktime',
  'avi',
  'webm',
  'mkv',
];
export const FileUseStreamVideo: string[] = ['m3u8'];
export const FileUseAudio: string[] = ['mp3', 'm4a', 'wav', 'wma', 'aac'];
export const FileUseImage: string[] = [
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
  'svg',
  'application/xml',
];
export const MIMETypeUseStream: string[] = ['application/x-mpegurl'];
export const MIMETypeVideo = 'video/*';
export const MIMETypeAudio = 'audio/*';
export const MIMETypeImage = 'image/*';
export const MIMETypeObject = 'text/csv';
export const MIMETypePdf = 'application/pdf';
export const MITETypeIframe = ['html', 'text/html', 'text/plain'];
