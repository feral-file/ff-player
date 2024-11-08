import { SOURCE_EXHIBITION_ID } from '@/utils/constants';
import { Exhibition, Series } from '@/models';
import axiosInstance from './axiosService';
import axios from 'axios';
import { removeArtistAliasSuffixes } from '@/utils/ui/formatAlias';
import * as Sentry from '@sentry/nextjs';

export class ExhibitionService {
  public async getExhibition(id: string) {
    try {
      if (id == SOURCE_EXHIBITION_ID) {
        return await this.getSourceExhibition();
      }

      const response = await axiosInstance.get(`/api/exhibitions/${id}`);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const exhibition = response.data.result as Exhibition;

      // Format artist/ curator alias remove suffix
      if (exhibition.curatorAlumni)
        exhibition.curatorAlumni.alias = removeArtistAliasSuffixes(
          exhibition.curatorAlumni.alias ?? ''
        );
      if (exhibition.artistsAlumni) {
        exhibition.artistsAlumni.map(artist => {
          artist.alias = removeArtistAliasSuffixes(artist.alias ?? '');
        });
      }

      return exhibition;
    } catch (error) {
      console.log('[API] Failed to load exhibition:', JSON.stringify(error));
      Sentry.captureException(error);
    }
  }

  private async getSourceExhibition(): Promise<Exhibition | undefined> {
    try {
      const response = await axios.get(
        `${
          process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''
        }/app/source_exhibition/exhibition.json`
      );

      const exhibition = response.data as Exhibition;
      const series = await this.getSourceSeries();
      exhibition.series = series;
      return exhibition;
    } catch (error) {
      console.log(
        '[API] Failed to load Source exhibition:',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
    }
  }

  private async getSourceSeries(): Promise<Series[] | undefined> {
    try {
      const response = await axios.get(
        `${
          process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''
        }/app/source_exhibition/series.json`
      );

      const series = response.data as Series[];
      return series;
    } catch (error) {
      console.log('[API] Failed to load Source series:', JSON.stringify(error));
      Sentry.captureException(error);
    }
  }
}
