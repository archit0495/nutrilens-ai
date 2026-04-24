import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, which blocks even modest phone photos.
      // Keep this in sync with MAX_IMAGE_BYTES in app/log-meal/actions.ts.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
