/** @type {import('next').NextConfig} */
const nextConfig = {
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
