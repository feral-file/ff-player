/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  env: {
    NEXT_PUBLIC_INDEXER_MAINNET_URL:
      process.env.NEXT_PUBLIC_INDEXER_MAINNET_URL,
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
};

export default nextConfig;
