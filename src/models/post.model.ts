import { Exhibition } from './exhibition.model';

export interface Post {
  id?: string;
  exhibitionID?: string;
  type: PostType;
  title?: string;
  content?: string;
  dateTime?: string;
  createdAt?: string;
  updatedAt?: string;
  displayIndex?: number;
  slug?: string;
  description?: string;
  author?: string;
  exhibition?: Exhibition;
  coverURI?: string;

  // Custom fields
  mediaType?: PostMediaType;
  thumbUrls?: string[];
  videoUrl?: string;
  date?: string;
  time?: string;
}

export enum PostType {
  CuratorNote = `Curator's note`,
  ArtistNote = `Artist's note`,
  CloseUp = 'close-up',
  Event = 'event',
  News = 'news',
  Schedule = 'schedule',
  WhitePaper = 'white-paper',
  J043Custom = 'jg043-custom',
}

export enum PostMediaType {
  Image = 'image',
  Video = 'video',
}

export enum YoutubeThumbnailVariants {
  highQuality = 'maxresdefault', // Higher quality - May or may not exist
  mediumQuality = 'mqdefault', // Lower quality - Guaranteed to exist
}
