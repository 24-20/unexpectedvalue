import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "10.5.0.2",
    "192.168.50.29",
    "192.168.*.*",
    "10.*.*.*",
  ],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/portfolio",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
