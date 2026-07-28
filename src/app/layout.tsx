import type { Metadata } from "next";
import "./globals.css";
import { OfflineBanner } from "./offline-banner";

export const metadata: Metadata = {
  title: "Tally — Event Transaction Hub",
  description: "Booth transaction and live leaderboard system for events.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}<OfflineBanner /></body>
    </html>
  );
}
