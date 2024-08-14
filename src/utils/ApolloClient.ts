import { ApolloClient, InMemoryCache } from '@apollo/client';

const createApolloClient = () => {
  return new ApolloClient({
    uri: `${process.env.NEXT_PUBLIC_INDEXER_MAINNET_URL ?? ''}/v2/graphql`,
    cache: new InMemoryCache(),
  });
};

export default createApolloClient;
