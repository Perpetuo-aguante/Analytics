import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El límite por defecto es 1MB; los .xlsx semanales pueden pesar más.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
