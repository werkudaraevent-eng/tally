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
  // Ask AI menjawab dari panduan fitur; berkasnya dibaca saat route berjalan.
  outputFileTracingIncludes: { "/api/admin/ai/tanya": ["./docs/PRODUCT.md"] },
  // Huruf halaman acara (src/app/fonts/landing.css) disimpan setahun. Isinya
  // tidak pernah berubah di folder yang sama: berkas baru masuk folder v2.
  async headers() {
    // Lengkapi data dan Baca pengumuman dari email (/peserta/kabar) membawa
    // token pribadi di `?t=`: jangan bocor lewat Referer.
    // Alamat /e/<slug>/... dan alamat domain klien (/lengkapi, /en/lengkapi).
    const tanpaReferer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    // Header keamanan untuk semua halaman dan API. Ditaruh PALING ATAS: bila dua
    // entri cocok dengan kunci yang sama, entri terakhir yang menang, jadi
    // Referrer-Policy khusus di bawah tetap berlaku.
    //   - frame-ancestors 'self' / SAMEORIGIN: halaman Tally hanya boleh dibingkai
    //     oleh origin-nya sendiri (pratinjau admin, StageScaler undian). Situs lain
    //     tidak bisa membingkai admin atau scanner untuk clickjacking.
    //   - nosniff: browser tidak menebak tipe berkas.
    const keamanan = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      { source: "/:path*", headers: keamanan },
      { source: "/fonts/v1/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      ...["/e/:slug/lengkapi", "/e/:slug/:bahasa(en|id)/lengkapi", "/lengkapi", "/:bahasa(en|id)/lengkapi", "/e/:slug/peserta/kabar", "/peserta/kabar"].map((source) => ({ source, headers: tanpaReferer })),
    ];
  },
};

export default nextConfig;
