import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client';
import createApolloClient from '@/utils/ApolloClient';
import { Artwork, IndexerToken, Alumni } from '@/models';
import axiosInstance from './axiosService';
import * as Sentry from '@sentry/nextjs';

const LIMIT_PER_PAGE = 50;

class ArtworkService {
  public async getArtworkDetail(artworkID: string): Promise<Artwork | null> {
    try {
      const response = await axiosInstance.get(
        `/api/artworks/${artworkID}?includeSeries=true`
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const artwork = response.data.result as Artwork;

      // FIXME: Remove this after the backend support full artist info on artwork detail
      if (artwork.series) {
        artwork.series.artist = await this.fetchArtist(artwork.series.artistID);
      }
      return artwork;
    } catch (error) {
      console.log('[API] Error getting artwork detail:', JSON.stringify(error));
    }

    return null;
  }

  public async queryTokens(ids: string[]): Promise<IndexerToken[]> {
    try {
      const client = createApolloClient();
      let tokens: IndexerToken[] = [];

      for (let i = 0; i < ids.length; i += LIMIT_PER_PAGE) {
        const idsChunk = ids.slice(i, i + LIMIT_PER_PAGE);
        const data = await this.queryTokensChunk(client, idsChunk);
        tokens = tokens.concat(data);
      }

      return tokens;
    } catch (error) {
      console.log('[API] Error querying tokens:', JSON.stringify(error));
      Sentry.captureException(error);
    }

    return [];
  }

  private async queryTokensChunk(
    client: ApolloClient<NormalizedCacheObject>,
    ids: string[]
  ): Promise<IndexerToken[]> {
    return new Promise((resolve, reject) => {
      client
        .query({
          query: gql`{tokens(ids: ["${ids.join('","')}"])
              {
                id
                blockchain
                fungible
                contractType
                contractAddress
                edition
                editionName
                mintedAt
                balance
                owner
                owners {
                  address
                  balance
                }
                indexID
                source
                swapped
                burned
                lastActivityTime
                originTokenInfo {
                  id
                  blockchain
                  fungible
                  contractType
                  contractAddress
                }
                provenance {
                  type
                  owner
                  blockchain
                  blockNumber
                  timestamp
                  txID
                  txURL
                }
                lastRefreshedTime
                asset{
                  indexID
                  thumbnailID
                  lastRefreshedTime
                  attributes {
                    scrollable
                  }
                  metadata{
                    project{
                      origin{
                        artistID
                        artistName
                        artistURL
                        artists{
                        name
                        id
                        url
                        }
                        assetID
                        title
                        description
                        mimeType
                        medium
                        maxEdition
                        baseCurrency
                        basePrice
                        source
                        sourceURL
                        previewURL
                        thumbnailURL
                        galleryThumbnailURL
                        assetData
                        assetURL
                        artworkMetadata
                      }
                      latest{
                        artistID
                        artistName
                        artistURL
                        artists{
                        name
                        id
                        url
                        }
                        assetID
                        title
                        description
                        mimeType
                        medium
                        maxEdition
                        baseCurrency
                        basePrice
                        source
                        sourceURL
                        previewURL
                        thumbnailURL
                        galleryThumbnailURL
                        assetData
                        assetURL
                        artworkMetadata
                      }
                    }
                  }
                }

              }
            }`,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((result: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          resolve(result.data.tokens);
        })
        .catch((error: unknown) => {
          console.log('[API] Error querying tokens:', JSON.stringify(error));
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        });
    });
  }

  private fetchArtist = async (artistID?: string): Promise<Alumni> => {
    const response = await axiosInstance.get(`/api/alumni/${artistID ?? ''}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return response.data.result as Alumni;
  };
}

export default ArtworkService;
