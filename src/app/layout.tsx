import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, Oswald, Playfair_Display, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { OfflineBanner } from "./offline-banner";

// Sebelumnya body memakai Arial. Geist di-self-host oleh next/font sehingga
// tidak ada request eksternal dan tidak ada layout shift saat font dimuat.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Pilihan jenis huruf untuk judul layar publik (/denah dan /display), dipilih
// admin lewat CMS. Semuanya di-self-host oleh next/font, sama seperti Geist.
//
// Alasannya operasional, bukan selera: LED di lokasi sering berada di jaringan
// buruk atau tertutup. Font yang diambil dari server luar bisa gagal dimuat di
// tengah acara, dan layar akan jatuh ke fallback yang tidak pernah diuji tepat
// ketika tidak ada yang bisa memperbaikinya.
//
// Hanya bobot yang benar-benar dipakai yang diminta. Judul di layar publik selalu
// tebal, jadi memuat seluruh rentang bobot hanya menambah berkas yang tidak
// pernah dirender.
//
// `display: "swap"` di semua: teks harus terbaca sejak render pertama. Layar LED
// tidak punya siapa pun yang menunggu, dan judul yang tertahan beberapa ratus
// milidetik lebih buruk daripada judul yang berganti font sekejap.
const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-geometric", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-condensed", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-grotesk", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-serif", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mono", display: "swap" });

// Variabel font tambahan digabung ke <html> supaya tersedia di seluruh halaman.
//
// Sengaja TIDAK mengubah `font-family` pada body: seluruh layar operasional
// (booth, kasir, admin) tetap memakai Geist. Font pilihan admin hanya dipasang
// per elemen di layar publik, sehingga menambah pilihan di sini tidak pernah
// mengubah tampilan halaman yang sudah rapi.
const fontVariables = [geist, montserrat, oswald, spaceGrotesk, playfair, geistMono]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "Tally — Event Transaction Hub",
  description: "Booth transaction and live leaderboard system for events.",
  manifest: "/manifest.webmanifest",
};

// dvh dipakai di seluruh layar operasional; tanpa viewport-fit toolbar browser
// mobile memotong area aman di iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2649d0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={fontVariables}>
      <body><ToastProvider>{children}<OfflineBanner /></ToastProvider></body>
    </html>
  );
}
