import { SOURCE_EXHIBITION_ID } from '@/utils/constants';
import { Exhibition, Series } from '@/models';
import axiosInstance from './axiosService';

export class ExhibitionService {
  public async getExhibition(id: string) {
    try {
      if (id == SOURCE_EXHIBITION_ID) {
        return await this.getSourceExhibition();
      }

      const response = await axiosInstance.get(`/api/exhibitions/${id}`);
      console.log('response', response);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const exhibition = response.data.result as Exhibition;
      return exhibition;
    } catch (error) {
      console.log('Failed to load exhibition:', error);
    }
  }

  private async getSourceExhibition(): Promise<Exhibition | undefined> {
    try {
      console.log(
        `${
          process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''
        }/source_exhibition/exhibition.json`
      );

      const response = await axiosInstance.get(
        '/source_exhibition/exhibition.json'
      );
      console.log('response', response);

      const exhibition = response.data as Exhibition;
      console.log('exhibition', exhibition);
      const series = await this.getSourceSeries();
      console.log('series', series);
      exhibition.series = series;
      console.log('exhibition', exhibition);

      return exhibition;
    } catch (error) {
      console.log('Failed to load Source exhibition:', error);
    }
  }

  private async getSourceSeries(): Promise<Series[] | undefined> {
    try {
      const response = await axiosInstance.get(
        '/source_exhibition/series.json'
      );
      console.log('response', response);

      const series = response.data as Series[];
      return series;
    } catch (error) {
      console.log('Failed to load Source series:', error);
    }
  }
}
