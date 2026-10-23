import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sandpack's preview loses its bundler listener under StrictMode's
  // double-mounted effects, leaving the loading overlay stuck in dev.
  reactStrictMode: false,
};

export default nextConfig;
