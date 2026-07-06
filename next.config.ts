import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dz50mdfc-3000.inc1.devtunnels.ms"],
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // Apply to every route
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "frame-ancestors",
              "https://*.myshopify.com",
              "https://admin.shopify.com",
              "https://*.spin.dev",
            ].join(" "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
