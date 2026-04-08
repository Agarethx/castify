import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@castify/types', '@castify/validators'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
