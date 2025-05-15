import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client';
import createApolloClient from '@/utils/ApolloClient';
import { Artwork, IndexerToken, AssetConfiguration } from '@/models';
import axiosInstance from './axiosService';
import * as Sentry from '@sentry/nextjs';

const LIMIT_PER_PAGE = 50;
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

  public getArtworkPreview(artwork: Artwork): string {
    const previewUrl =
      artwork.metadata?.alternativePreviewURI ??
      artwork.metadata?.previewCloudFlareURL ??
      artwork.previewDisplay?.HLS ??
      artwork.previewURI;

    return previewUrl ? this.transformPreviewSrc(previewUrl) : '';
  }

  public async queryIndexerToken(id: string): Promise<IndexerToken | null> {
    const client = createApolloClient();
    const data = await this.queryTokensChunk(client, [id]);
    const token = data[0] || null;
    return token;
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

  public async queryTokenConfiguration(
    tokenId: string
  ): Promise<AssetConfiguration | undefined> {
    const client = createApolloClient();

    return new Promise((resolve, reject) => {
      client
        .query({
          query: gql`
            {
              tokens(
                ids: ["${tokenId}"]
                burnedIncluded: true
              ) {
                asset {
                  attributes {
                    configuration {
                      scaling
                      backgroundColor
                      marginLeft
                      marginRight
                      marginTop
                      marginBottom
                      autoPlay
                      looping
                      interactable
                      overridable
                    }
                  }
                }
              }
            }
          `,
        })
        .then((result: { data: { tokens: IndexerToken[] } }) => {
          if (result.data.tokens.length === 0) {
            resolve(undefined);
          }

          const token = result.data.tokens[0];
          resolve(token.asset?.attributes?.configuration);
        })
        .catch((error: unknown) => {
          console.log('[API] Error querying tokens:', JSON.stringify(error));
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        });
    });
  }

  private async queryTokensChunk(
    client: ApolloClient<NormalizedCacheObject>,
    ids: string[]
  ): Promise<IndexerToken[]> {
    return new Promise((resolve, reject) => {
      client
        .query({
          query: gql`
            {
              tokens(
                ids: ["${ids.join('","')}"]
                burnedIncluded: true
              ) {
                id
                contractAddress
                indexID
                source
                asset {
                  thumbnailID
                  staticPreviewURLLandscape
                  staticPreviewURLPortrait
                  metadata {
                    project {
                      latest {
                        medium
                        previewURL
                      }
                    }
                  }
                }
              }
            }
          `,
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
