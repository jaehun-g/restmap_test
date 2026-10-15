import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["mysql2"],
  allowedDevOrigins: ["172.30.1.37"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
