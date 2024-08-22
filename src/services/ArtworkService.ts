import { Artwork } from '../utils/types';
import { gql } from '@apollo/client';
import createApolloClient from '@/utils/ApolloClient';
import { IndexerToken } from '@/models';
import axiosInstance from './axiosService';
import { removeArtistAliasSuffixes } from '@/utils/ui/formatAlias';

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
    const artistAlias = (response.data.result.alias ?? '') as string;

    return removeArtistAliasSuffixes(artistAlias);
  };

  public async queryTokens(ids: string[]): Promise<IndexerToken[]> {
    try {
      const client = createApolloClient();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data } = await client.query({
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
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return data.tokens;
    } catch (error) {
      console.log('Error querying tokens:', JSON.stringify(error));
    }

    return [];
  }
}

export default ArtworkService;
