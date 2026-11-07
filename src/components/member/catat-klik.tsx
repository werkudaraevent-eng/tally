"use client";

import { useEffect } from "react";

/**
 * Catat klik dari email di halaman baca pengumuman. Pemindai tautan kantor
 * hanya mengambil HTML; yang menjalankan JS (Safe Links, Mimecast, Proofpoint)
 * tidak menyentuh layar dan tidak memegang fokus. Jadi klik baru dicatat
 * setelah ada sentuhan, tombol, atau gulir, atau setelah halaman terlihat dan
 * terfokus selama 3 detik (temuan QA M2).
 */
export function CatatKlik({ slug, token }: { slug: string; token: string }) {
  useEffect(() => {
    let selesai = false;
    let detik = 0;
    const catat = () => {
      if (selesai) return;
      selesai = true;
      lepas();
      void fetch(`/e/${encodeURIComponent(slug)}/api/jejak/klik`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
        keepalive: true,
      }).catch(() => null);
    };
    const peristiwa = ["pointerdown", "touchstart", "keydown", "scroll"] as const;
    peristiwa.forEach((nama) => window.addEventListener(nama, catat, { passive: true, once: true }));
    const jam = window.setInterval(() => {
      detik = document.visibilityState === "visible" && document.hasFocus() ? detik + 1 : 0;
      if (detik >= 3) catat();
    }, 1000);
    function lepas() {
      peristiwa.forEach((nama) => window.removeEventListener(nama, catat));
      window.clearInterval(jam);
    }
    return lepas;
  }, [slug, token]);
  return null;
}
