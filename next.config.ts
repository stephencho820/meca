import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/manage",
      headers: [
        {key:"Referrer-Policy",value:"no-referrer"},
        {key:"Cache-Control",value:"no-store"},
        {key:"X-Robots-Tag",value:"noindex, nofollow"},
        {key:"X-Content-Type-Options",value:"nosniff"}
      ]
    }];
  }
};
export default nextConfig;
