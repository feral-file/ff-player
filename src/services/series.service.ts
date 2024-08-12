import { Artwork, Exhibition, Series } from '@/models';
import axios from 'axios';

const cloudFlareHostingDomain = 'imagedelivery.net';
const ipfsGateway = 'https://ipfs.io/ipfs/';

export class SeriesService {
  public async getArtworkOfSeries(seriesID: string): Promise<Artwork[]> {
    try {
      const response = await axios.get<{ result: Artwork[] }>(
        `${process.env.NEXT_PUBLIC_API_URL!}/api/artworks?seriesID=${seriesID}`
      );
      return response.data?.result;
    } catch (error) {
      console.log('Failed to load artworks of series:', error);
      return [];
    }
  }

  public async getArtwork(
    id: string,
    exhibition?: Exhibition
  ): Promise<Artwork | null | undefined> {
    try {
      if (exhibition?.id == 'source') {
        return this.getSourceArtwork(id, exhibition);
      }

      const response = await axios.get<{ result: Artwork }>(
        `${process.env.NEXT_PUBLIC_API_URL!}/api/artworks/${id}`
      );
      return response.data?.result;
    } catch (error) {
      console.log('Failed to load artwork:', error);
      return {};
    }
  }

  private async getSourceArtwork(artworkID: string, exhibition: Exhibition) {
    const listArtworks =
      exhibition.series?.flatMap(series => series.artworks ?? []) ?? [];

    const artwork = listArtworks.find(artwork => artwork?.id === artworkID);

    if (artwork) {
      artwork.series = exhibition.series?.find(
        element => element.id == artwork.seriesID
      );
    }

    return artwork;
  }

  public getArtworkPreview(artwork: Artwork) {
    let previewUrl =
      artwork.metadata?.alternativePreviewURI ||
      artwork.metadata?.previewCloudFlareURL ||
      artwork.previewURI;

    return previewUrl && this.transformPreviewSrc(previewUrl);
  }

  private transformPreviewSrc(src: string): string {
    if (src.startsWith('https')) {
      if (src.includes(cloudFlareHostingDomain)) {
        const variantSuffix = '/thumbnail';
        return src.includes(variantSuffix) ? src : src + '/thumbnailLarge';
      } else {
        return src;
      }
    } else if (src.startsWith('ipfs://')) {
      return src.replace('ipfs://', ipfsGateway);
    } else if (src.includes('/assets/images/empty_image.svg')) {
      return src;
    }

    return process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL! + '/' + src;
  }
}
