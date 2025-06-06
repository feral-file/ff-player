import {
  NETWORK_ERROR_RETRY_COUNT,
  NETWORK_ERROR_RETRY_DELAY,
} from '@/constants';
import { ApolloClient, InMemoryCache, from, HttpLink } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { GraphQLFormattedError } from 'graphql';

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(
      ({ message, locations, path }: GraphQLFormattedError) => {
        const locationStr =
          locations
            ?.map(loc => `${String(loc.line)}:${String(loc.column)}`)
            .join(', ') ?? 'unknown';
        const pathStr = path?.join('.') ?? 'unknown';
        console.error(
          `[GraphQL error]: Message: ${message}, Location: ${locationStr}, Path: ${pathStr}`
        );
      }
    );
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError.message}`);
  }
});

const retryLink = new RetryLink({
  delay: {
    initial: NETWORK_ERROR_RETRY_DELAY,
    max: Infinity,
    jitter: true,
  },
  attempts: {
    max: NETWORK_ERROR_RETRY_COUNT,
    retryIf: error => {
      console.log('[Apollo Retry] Checking if should retry error:', error);

      // Check for network errors - safely check if error has networkError property
      const shouldRetry = Boolean(
        error &&
          typeof error === 'object' &&
          'networkError' in error &&
          (error as { networkError?: unknown }).networkError != null
      );

      if (shouldRetry) {
        console.log('[Apollo Retry] Will retry due to network error');
      } else {
        console.log('[Apollo Retry] Will not retry - not a network error');
      }

      return shouldRetry;
    },
  },
});

const httpLink = new HttpLink({
  uri: `${process.env.NEXT_PUBLIC_INDEXER_MAINNET_URL ?? ''}/v2/graphql`,
});

const createApolloClient = () => {
  return new ApolloClient({
    link: from([errorLink, retryLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all',
      },
      query: {
        fetchPolicy: 'network-only',
        errorPolicy: 'all',
      },
      mutate: {
        errorPolicy: 'all',
      },
    },
  });
};

export default createApolloClient;
