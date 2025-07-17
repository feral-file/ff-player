import { IndexerToken } from '@/models';
import createApolloClient from '@/utils/ApolloClient';
import { customPreviewFromTokenMetadata } from '@/utils/helper';
import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client';
import * as Sentry from '@sentry/nextjs';

const LIMIT_PER_PAGE = 50;

export const IndexerService = {
  async getIndexerTokenPreview(token: IndexerToken): Promise<string> {
    if (
      token.asset?.metadata.project.latest.artworkMetadata?.isFeralfileFrame
    ) {
      return (
        (await customPreviewFromTokenMetadata(
          {
            address: token.contractAddress,
            blockchainType: token.blockchain,
          },
          token.id
        )) ?? ''
      );
    }

    return token.asset?.metadata.project.latest.previewURL ?? '';
  },

  async queryIndexerToken(id: string): Promise<IndexerToken | null> {
    const client = createApolloClient();
    const data = await IndexerService.queryTokensChunk(client, [id]);
    const token = data[0] || null;
    return token;
  },

  async queryTokens(ids: string[]): Promise<IndexerToken[]> {
    try {
      const client = createApolloClient();
      let tokens: IndexerToken[] = [];

      for (let i = 0; i < ids.length; i += LIMIT_PER_PAGE) {
        const idsChunk = ids.slice(i, i + LIMIT_PER_PAGE);
        const data = await IndexerService.queryTokensChunk(client, idsChunk);
        tokens = tokens.concat(data);
      }

      return tokens;
    } catch (error) {
      console.log('[API] Error querying tokens:', JSON.stringify(error));
      Sentry.captureException(error);
      return [];
    }
  },

  async queryTokensChunk(
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
  },
};
