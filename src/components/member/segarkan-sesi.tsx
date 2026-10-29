"use client";

import { useEffect } from "react";

/**
 * Sekali sehari per acara saat portal dibuka: perpanjang sesi dan cookie-nya
 * (POST /api/peserta/sesi). Tanpa localStorage (mode privat) tetap jalan,
 * hanya lebih sering.
 */
export function SegarkanSesi({ slug }: { slug: string }) {
  useEffect(() => {
    const kunci = `tally-sesi-segar:${slug}`;
    const hari = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(kunci) === hari) return;
    } catch {}
    void fetch(`/e/${encodeURIComponent(slug)}/api/peserta/sesi`, { method: "POST" })
      .then((jawab) => {
        if (!jawab.ok) return;
        try {
          window.localStorage.setItem(kunci, hari);
        } catch {}
      })
      .catch(() => null);
  }, [slug]);
  return null;
}
