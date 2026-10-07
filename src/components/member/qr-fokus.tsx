"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * QR layar penuh di portal gathering adalah halaman sendiri (`?tab=qr`). Tiga
 * bagian kecil ini membuatnya berperilaku seperti dialog (QA #105 L4):
 * Escape menutupnya, dan fokus kembali ke tombol yang membukanya.
 */

const KUNCI = "tally-pemicu-qr";

/** Tautan pembuka QR: mengingat dirinya supaya fokus bisa kembali ke sini. */
export function PemicuQr({ id, href, className, children }: { id: string; href: string; className: string; children: ReactNode }) {
  return (
    <Link
      id={id}
      href={href}
      className={className}
      onClick={() => {
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
