"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * QR layar penuh di portal gathering adalah halaman sendiri (`?tab=qr`). Tiga
 * bagian kecil ini membuatnya berperilaku seperti dialog (QA #105 L4):
 * Escape menutupnya, dan fokus kembali ke tombol yang membukanya.
 *
 * Di portal Horizon, PemicuQr membuka lapisan QR di halaman yang sama
 * (components/member/lapisan-qr.tsx) bila penyedianya ada: QR tampil seketika
 * dan tetap bisa dibuka saat sinyal hilang. Tanpa penyedia (preset lain, tab
 * baru, tanpa JavaScript) ia tetap tautan biasa ke `?tab=qr`.
 */

const KUNCI = "tally-pemicu-qr";

/** Disediakan PenyediaQr: membuka lapisan QR dan mengingat tombol pembukanya. */
export const KonteksLapisanQr = createContext<{ buka: (href: string, pemicu: HTMLElement) => void } | null>(null);

/** Tautan pembuka QR: mengingat dirinya supaya fokus bisa kembali ke sini. */
export function PemicuQr({ id, href, className, children }: { id: string; href: string; className: string; children: ReactNode }) {
  const lapisan = useContext(KonteksLapisanQr);
  return (
    <Link
      id={id}
      href={href}
      prefetch={lapisan ? false : undefined}
      className={className}
      onClick={(event) => {
        // Klik dengan pengubah (tab baru, jendela baru) tetap navigasi biasa.
        if (lapisan && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          lapisan.buka(href, event.currentTarget);
          return;
        }
        try {
          sessionStorage.setItem(KUNCI, id);
        } catch {
          // Penyimpanan diblokir: QR tetap terbuka, hanya fokusnya tidak kembali.
        }
      }}
    >
      {children}
    </Link>
  );
}

/** Di halaman QR: Escape kembali ke portal. */
export function TutupQrEscape({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const tekan = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(href);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [href, router]);
  return null;
}

/** Di portal: fokuskan kembali tombol yang tadi membuka QR. */
export function FokusPemicuQr() {
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(KUNCI);
      sessionStorage.removeItem(KUNCI);
    } catch {
      return;
    }
    if (id) document.getElementById(id)?.focus();
  }, []);
  return null;
}
