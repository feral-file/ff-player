/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export',
  env: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
    NEXT_PUBLIC_PUB_DOC_URL: process.env.NEXT_PUBLIC_PUB_DOC_URL,
    NEXT_PUBLIC_LOG_SAMPLE_RATE: process.env.NEXT_PUBLIC_LOG_SAMPLE_RATE,
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

export default nextConfig;
