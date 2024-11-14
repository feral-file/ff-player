export enum CastingArtworkType {
  Unknown = 'UNKNOWN',
  Daily = 'DAILY_DISPLAY',
  Playlist = 'PLAYLIST_DISPLAY',
  Exhibition = 'EXHIBITION_DISPLAY',
}
export interface MetricEvent {
  event: CastingArtworkType;
  timestamp: string;
  parameters: {
    tokenID: string;
  };
}
