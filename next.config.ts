import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext examines multipart POSTs before dispatching API routes.
  // Keep this ceiling above the API's 31 MiB bounded multipart reader.
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
};

export default nextConfig;
