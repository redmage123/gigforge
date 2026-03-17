import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Allow SVGs and local images without optimization server
    unoptimized: true,
  },
}

export default nextConfig
