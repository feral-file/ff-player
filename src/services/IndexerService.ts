import { IndexerToken } from '@/models';
import apolloClient from '@/utils/ApolloClient';
import { customPreviewFromTokenMetadata } from '@/utils/helper';
import { gql } from '@apollo/client';
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
    try {
      const data = await IndexerService.queryTokensChunk([id]);
      const token = data[0] || null;
      return token;
    } catch (error) {
      console.log('[API] Error querying indexer token:', JSON.stringify(error));
      Sentry.captureException(error);
      return null;
    }
  },

  async queryTokens(ids: string[]): Promise<IndexerToken[]> {
    try {
      let tokens: IndexerToken[] = [];

      for (let i = 0; i < ids.length; i += LIMIT_PER_PAGE) {
        const idsChunk = ids.slice(i, i + LIMIT_PER_PAGE);
        const data = await IndexerService.queryTokensChunk(idsChunk);
        tokens = tokens.concat(data);
      }

      return tokens;
    } catch (error) {
      console.log('[API] Error querying tokens:', JSON.stringify(error));
      Sentry.captureException(error);
      return [];
    }
  },

  async queryTokensChunk(ids: string[]): Promise<IndexerToken[]> {
    return new Promise((resolve, reject) => {
      apolloClient
        .query({
          query: gql`
            {
              tokens(
                ids: ["${ids.join('","')}"]
                burnedIncluded: true
              ) {
                id
                blockchain
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
                        title
                        medium
                        previewURL
                        artworkMetadata
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
