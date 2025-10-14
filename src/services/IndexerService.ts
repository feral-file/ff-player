import { IndexerToken } from '@/models';
import apolloClient from '@/utils/ApolloClient';
import { gql } from '@apollo/client';
import * as Sentry from '@sentry/nextjs';

export const IndexerService = {
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
                owner
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
