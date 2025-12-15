import { withSentryConfig } from '@sentry/nextjs';
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
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SUPPORT_API_URL: process.env.NEXT_PUBLIC_SUPPORT_API_URL,
    NEXT_PUBLIC_SUPPORT_API_KEY: process.env.NEXT_PUBLIC_SUPPORT_API_KEY,
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  reactStrictMode: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
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

      if (
        entries['main-app'] &&
        !entries['main-app'].includes('core-js/stable/queue-microtask')
      ) {
        entries['main-app'].unshift('core-js/stable/queue-microtask');
      }

      if (
        entries['main-app'] &&
        !entries['main-app'].includes('core-js/proposals/object-from-entries')
      ) {
        entries['main-app'].unshift('core-js/proposals/object-from-entries');
      }

      return entries;
    };

    return config;
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'bitmark-inc',
  project: 'feralfile-display',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
