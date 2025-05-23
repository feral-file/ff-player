import { ApolloClient, InMemoryCache, from, HttpLink } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
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

const httpLink = new HttpLink({
  uri: `${process.env.NEXT_PUBLIC_INDEXER_MAINNET_URL ?? ''}/v2/graphql`,
});

const createApolloClient = () => {
  return new ApolloClient({
    link: from([errorLink, httpLink]),
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
