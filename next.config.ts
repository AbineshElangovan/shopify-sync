import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
