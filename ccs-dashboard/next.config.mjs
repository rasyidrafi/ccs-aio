/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/limits",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
        ],
      },
    ]
  },
}

export default nextConfig
