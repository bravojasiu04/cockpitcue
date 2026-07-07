import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cockpitcue.com" }],
        destination: "https://cockpitcue.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
