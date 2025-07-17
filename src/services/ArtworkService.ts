import { Artwork, Series } from '@/models';
import axiosInstance from './axiosService';
import { customPreviewFromTokenMetadata } from '@/utils/helper';
import { SeriesService } from './series.service';
import { ExhibitionService } from './exhibition.service';

const cloudFlareHostingDomain = 'imagedelivery.net';
const ipfsGateway = 'https://ipfs.io/ipfs/';

class ArtworkService {
  public async getArtworkDetail(
    artworkID: string,
    includeSeries = true,
    includeSuccessfulSwap = false
  ): Promise<Artwork | null> {
    try {
      const path = `/api/artworks/${artworkID}`;
      const params = new URLSearchParams();
      if (includeSeries) {
        params.append('includeSeries', 'true');
      }

      if (includeSuccessfulSwap) {
        params.append('includeSuccessfulSwap', 'true');
      }

      const queryString = params.toString();
      const fullPath = queryString ? `${path}?${queryString}` : path;
      const response = await axiosInstance.get(fullPath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return response.data.result as Artwork;
    } catch (error) {
      console.log('[API] Error getting artwork detail:', JSON.stringify(error));
    }

    return null;
  }

  public async getArtworkPreview(
    artwork: Artwork,
    series?: Series
  ): Promise<string> {
    if (!series) {
      series = await new SeriesService().getSeries(artwork.seriesID ?? '');
    }

    if (series.metadata?.onchainRenderer && artwork.id) {
      if (!series.exhibition) {
        const exhibition = await new ExhibitionService().getExhibition(
          series.exhibitionID
        );
        series.exhibition = exhibition;
      }

      return (
        (await customPreviewFromTokenMetadata(
          series.exhibition?.contracts?.find(
            contract =>
              contract.blockchainType === series.exhibition?.mintBlockchain
          ),
          artwork.id
        )) ?? ''
      );
    }

    const previewUrl =
      artwork.metadata?.alternativePreviewURI ??
      artwork.metadata?.previewCloudFlareURL ??
      artwork.previewDisplay?.HLS ??
      artwork.previewURI;

    return previewUrl ? this.transformPreviewSrc(previewUrl) : '';
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

    return `${process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL ?? ''}/${src}`;
  }
}

export default ArtworkService;
