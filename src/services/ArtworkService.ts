import { Artwork } from '@/models';
import axiosInstance from './axiosService';

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
}

export const artworkService = new ArtworkService();
