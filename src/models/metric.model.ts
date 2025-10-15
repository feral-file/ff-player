export enum CastingArtworkType {
  Unknown = 'UNKNOWN',
  Playlist = 'PLAYLIST_DISPLAY',
}

export interface MetricEvent {
  event: CastingArtworkType;
  timestamp: string;
  parameters: {
    tokenID?: string;
  };
}
