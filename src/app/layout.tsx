import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
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
    <html lang="id" className={geist.variable}>
      <body><ToastProvider>{children}<OfflineBanner /></ToastProvider></body>
    </html>
  );
}
