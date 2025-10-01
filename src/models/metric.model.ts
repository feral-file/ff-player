export enum CastingArtworkType {
  Unknown = 'UNKNOWN',
  Playlist = 'PLAYLIST_DISPLAY',
  Exhibition = 'EXHIBITION_DISPLAY',
}

export enum ExhibitionDisplaySection {
  Home = 'home',
  CuratorNote = 'curator_note',
  Artworks = 'artworks',
}

export interface MetricEvent {
  event: CastingArtworkType;
  timestamp: string;
  parameters: {
    section?: ExhibitionDisplaySection;
    tokenID?: string;
    exhibitionID?: string;
  };
}
