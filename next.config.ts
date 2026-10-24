import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sandpack's preview loses its bundler listener under StrictMode's
  // double-mounted effects, leaving the loading overlay stuck in dev.
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nobody else may frame the app (clickjacking). A full CSP is left out
          // on purpose: Sandpack loads its bundler and preview from codesandbox.io.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
