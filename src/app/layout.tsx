import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { MotionProvider } from "@/components/motion-provider";
import { ToastProvider } from "@/components/toast";
import { OfflineBanner } from "./offline-banner";
import { THEME_INIT_SCRIPT } from "@/lib/m3/theme";

// Huruf: Inter untuk antarmuka (--font-sans), lima huruf judul layar publik
// yang dipilih admin lewat CMS (--font-geometric, --font-condensed,
// --font-grotesk, --font-serif, --font-source), Ubuntu untuk tata letak Forum
// (--font-ubuntu) dan Geist Mono (--font-mono).
// Semuanya disimpan di repo dan dimuat lewat next/font/local di ./fonts.ts,
// jadi tidak ada permintaan ke server luar, baik saat build maupun saat acara.
//
// Alasannya operasional, bukan selera: LED di lokasi sering berada di jaringan
// buruk atau tertutup, dan build Vercel pernah gagal berulang kali karena
// mengunduh huruf dari Google.
//
// Variabel font digabung ke <html> supaya tersedia di seluruh halaman.
// Sengaja TIDAK mengubah `font-family` pada body: font pilihan admin hanya
// dipasang per elemen di layar publik, sehingga menambah pilihan di sini tidak
// pernah mengubah tampilan halaman yang sudah rapi.

export const metadata: Metadata = {
  title: "Tally — Pusat operasional acara",
  description: "Pendaftaran, kehadiran, layar panggung, dan transaksi booth untuk acara yang berjalan langsung.",
  manifest: "/manifest.webmanifest",
};

// dvh dipakai di seluruh layar operasional; tanpa viewport-fit toolbar browser
// mobile memotong area aman di iPhone.
//
// themeColor mengikuti skema, bukan satu warna brand. Bilah alamat Chrome
// mobile memakai nilai ini; satu warna tetap berarti bilah biru terang menempel
// di atas halaman gelap. Nilainya adalah peran `surface` dari m3-theme.css —
// perbarui bila warna sumber diganti.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a082f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: skrip di bawah menulis data-theme ke <html>
    // sebelum React sempat menghidrasi, jadi atribut di DOM memang berbeda dari
    // markup server. Itu disengaja, dan hanya atribut ini yang terpengaruh.
    // data-scroll-behavior: sejak Next 16, `scroll-behavior: smooth` di <html>
    // TIDAK lagi dimatikan otomatis saat pindah rute. Tanpa atribut ini, setiap
    // navigasi di halaman admin yang panjang ikut menggulir halus ke atas —
    // gerak yang tidak diminta siapa pun. Atribut ini mengembalikan perilaku
    // lama: halus untuk jangkar di halaman, seketika untuk pindah halaman.
    <html lang="id" className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* <script> MENTAH di <head>, sengaja — bukan next/script.
            `next/script` dengan `beforeInteractive` untuk skrip inline TIDAK
            menyuntikkan <script> ke <head>: DIUKUR pada HTML hasil build, ia
            menaruh isinya ke antrean `self.__next_s` di ujung <body>, yang
            baru dijalankan runtime Next setelah dokumen terparse. Untuk skrip
            tema itu berarti halaman sempat tergambar terang lalu berkedip
            gelap — persis yang ingin dihindari.

            Harganya satu peringatan konsol di dev, "Scripts inside React
            components are never executed", yang hanya muncul bila root layout
            dirender ulang di klien (pemulihan dari galat). Peringatan itu benar
            secara harfiah dan tidak berdampak: skrip ini sudah dijalankan oleh
            peramban dari HTML awal, jauh sebelum React menyentuhnya. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body><MotionProvider><ToastProvider>{children}<OfflineBanner /></ToastProvider></MotionProvider></body>
    </html>
  );
}
