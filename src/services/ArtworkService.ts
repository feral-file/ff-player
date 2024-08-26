import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client';
import createApolloClient from '@/utils/ApolloClient';
import { Artwork, IndexerToken } from '@/models';
import axiosInstance from './axiosService';
import { removeArtistAliasSuffixes } from '@/utils/ui/formatAlias';

const LIMIT_PER_PAGE = 50;

class ArtworkService {
  public async getFeaturedArtworks(): Promise<Artwork[]> {
    const response = await axiosInstance.get(`/api/artworks/featured`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const artworks = response.data.result as Artwork[];
    for (const artwork of artworks) {
      artwork.artistAlias = await this.fetchArtist(artwork.series?.artistID);
    }
    return artworks;
  }

  private fetchArtist = async (artistID?: string): Promise<string> => {
    const response = await axiosInstance.get(`/api/accounts/${artistID ?? ''}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const artistAlias = (response.data.result.alumniAccount?.alias ??
      '') as string;

    return removeArtistAliasSuffixes(artistAlias);
  };

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
      console.log('Error querying tokens:', JSON.stringify(error));
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
          console.log('Error querying tokens:', JSON.stringify(error));
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        });
    });
  }
}

export default ArtworkService;
