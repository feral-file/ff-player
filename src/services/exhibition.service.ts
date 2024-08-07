import axios from "axios";
import { SOURCE_EXHIBITION_ID } from "@/utils/constants";
import { Exhibition, Series } from "@/models";

export class ExhibitionService {
  public async getExhibition(id: string) {
    try {
      if (id == SOURCE_EXHIBITION_ID) {
        return await this.getSourceExhibition();
      }

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL!}/api/exhibitions/${id}`
      );
      console.log("response", response);

      const exhibition = response.data.result as Exhibition;
      return exhibition;
    } catch (error) {
      console.log("Failed to load exhibition:", error);
    }
  }

  private async getSourceExhibition(): Promise<Exhibition | undefined> {
    // try {
    //   final response = await http.get(Uri.parse(
    //       '${Environment.pubDocURL}/source_exhibition/exhibition.json'));
    //   if (response.statusCode == 200) {
    //     final body = json.decode(response.body);
    //     final map = body as Map<String, dynamic>;
    //     final exhibition = Exhibition.fromJson(map);
    //     final series = await _getSourceSeries();
    //     exhibition.series = series;
    //     return exhibition;
    //   } else {
    //     throw Exception('Failed to load SOURCE exhibition');
    //   }
    // } catch (e) {
    //   throw Exception('Failed to load SOURCE exhibition');
    // }

    try {
      console.log(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL!}/source_exhibition/exhibition.json`
      );

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL!}/source_exhibition/exhibition.json`
      );
      console.log("response", response);

      const exhibition = response.data as Exhibition;
      console.log("exhibition", exhibition);
      const series = await this.getSourceSeries();
      console.log("series", series);
      exhibition.series = series;
      console.log("exhibition", exhibition);

      return exhibition;
    } catch (error) {
      console.log("Failed to load Source exhibition:", error);
    }
  }

  private async getSourceSeries(): Promise<Series[] | undefined> {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL!}/source_exhibition/series.json`
      );
      console.log("response", response);

      const series = response.data as Series[];
      return series;
    } catch (error) {
      console.log("Failed to load Source series:", error);
    }
  }
}
