import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Halaman lama dipakai ulang; browser tetap menampilkan /e/<slug>/...
      // dan slug diteruskan sebagai query untuk Server Components.
      { source: "/e/:eventSlug/api/:path*", destination: "/api/:path*?eventSlug=:eventSlug" },
      { source: "/e/:eventSlug/:path*", destination: "/:path*?eventSlug=:eventSlug" },
    ];
  },
};

export default nextConfig;
