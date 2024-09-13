/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  env: {
    NEXT_PUBLIC_INDEXER_MAINNET_URL:
      process.env.NEXT_PUBLIC_INDEXER_MAINNET_URL,
    NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
    NEXT_PUBLIC_ACCOUNTS_API_KEY: process.env.NEXT_PUBLIC_ACCOUNTS_API_KEY,
    NEXT_PUBLIC_AUTONOMY_IPFS_PREFIX:
      process.env.NEXT_PUBLIC_AUTONOMY_IPFS_PREFIX,
    NEXT_PUBLIC_FERAL_FILE_ASSET_URL:
      process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_PUB_DOC_URL: process.env.NEXT_PUBLIC_PUB_DOC_URL,
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    NEXT_PUBLIC_WEBSOCKET_API_KEY: process.env.NEXT_PUBLIC_WEBSOCKET_API_KEY,
    NEXT_PUBLIC_BRANCH_KEY: process.env.NEXT_PUBLIC_BRANCH_KEY,
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  reactStrictMode: false,
  webpack: config => {
    const originalEntry = config.entry;

    config.entry = async () => {
      const entries = await originalEntry();

      // Ensure the core-js global-this polyfill is loaded first
      if (
        entries['main-app'] &&
        !entries['main-app'].includes('core-js/features/global-this')
      ) {
        entries['main-app'].unshift('core-js/features/global-this');
      }

      return entries;
    };

    return config;
  },
};

export default nextConfig;
