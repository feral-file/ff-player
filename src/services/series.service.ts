import { Artwork, Exhibition } from '@/models';
import axiosInstance from './axiosService';
import * as Sentry from '@sentry/nextjs';

export class SeriesService {
  public async getArtwork(
    id: string,
    exhibition?: Exhibition
  ): Promise<Artwork | null | undefined> {
    try {
      if (exhibition?.id == 'source') {
        return this.getSourceArtwork(id, exhibition);
      }

      const response = await axiosInstance.get<{ result: Artwork }>(
        `/api/artworks/${id}?includeSeries=true&includeActiveSwap=true`
      );
      return response.data.result;
    } catch (error) {
      console.log('[API] Failed to load artwork:', JSON.stringify(error));
      Sentry.captureException(error);
      return {};
    }
  }

  private getSourceArtwork(artworkID: string, exhibition: Exhibition) {
    const listArtworks =
      exhibition.series?.flatMap(series => series.artworks ?? []) ?? [];

    const artwork = listArtworks.find(artwork => artwork.id === artworkID);

    if (artwork) {
      artwork.series = exhibition.series?.find(
        element => element.id == artwork.seriesID
      );
    }

    return artwork;
  }
}
