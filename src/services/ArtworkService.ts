import { Artwork } from '../utils/types';
import { gql } from '@apollo/client';
import createApolloClient from '@/utils/ApolloClient';
import axios from 'axios';

class ArtworkService {
  public async getFeaturedArtworks(): Promise<Artwork[]> {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL!}/api/artworks/featured`
    );
    const artworks = response.data.result as Artwork[];
    if (artworks) {
      for (let artwork of artworks) {
        artwork.artistAlias = await this.fetchArtist(artwork?.series?.artistID);
      }
    }
    return artworks;
  }

  private fetchArtist = async (artistID?: string) => {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL!}/api/accounts/${artistID}`
    );

    return response.data.result.alias;
  };

  public queryTokens = async (ids: string[]) => {
    try {
      const client = createApolloClient();
      const { data } = await client.query({
        query: gql`{tokens(ids: ["${ids.join('","')}"], offset: 0, size: 10)
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
      console.log('NFT Tokens:', JSON.stringify(data));
      return data;
    } catch (error) {
      console.log('Error querying tokens:', JSON.stringify(error));
    }

    return null;
  };
}

export default ArtworkService;
