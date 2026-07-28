import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
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
      <body><ToastProvider>{children}<OfflineBanner /></ToastProvider></body>
    </html>
  );
}
