import { createRequire } from "node:module";
import type { NextConfig } from "next";

// Versi aplikasi datang dari package.json, satu sumber. Menuliskannya ulang di
// konstanta TypeScript berarti angka di kaki sidebar bisa berbeda dari versi yang
// benar-benar dirilis — dan yang dibaca orang saat melaporkan bug adalah yang di
// layar.
const { version } = createRequire(import.meta.url)("./package.json") as { version: string };

// Rewrite untuk URL ber-scope event (`/e/<slug>/...`) TIDAK ditaruh di sini.
//
// Awalnya dicoba lewat `rewrites()`, dan DIUKUR gagal meneruskan slug:
// `/e/<slug-ngawur>/api/leaderboard` tetap membalas 200 sementara
// `?eventSlug=<ngawur>` langsung membalas 404 — query pada destination rewrite
// tidak pernah sampai ke route handler, sehingga handler jatuh ke event aktif
// tunggal dan slug di URL diabaikan. Dua varian pola (`:path+`, lalu destination
// `:path*`) memberi hasil sama.
//
// Mekanismenya dipindah ke `src/proxy.ts`: proxy berjalan lebih dulu, tujuannya
// dapat dipastikan, dan satu mekanisme lebih mudah dipertanggungjawabkan
// daripada dua lapisan yang saling menimpa.
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Huruf halaman acara (src/app/fonts/landing.css) disimpan setahun. Isinya
  // tidak pernah berubah di folder yang sama: berkas baru masuk folder v2.
  async headers() {
    return [{ source: "/fonts/v1/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
