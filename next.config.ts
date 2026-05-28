import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/scorchpad',
        destination: 'https://scorchpad.rsaatlabs.com',
        permanent: true,
      },
    ]
  }
};

export default nextConfig;
