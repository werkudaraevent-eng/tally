"use client";

import { useEffect } from "react";

/**
 * Catat klik dari email setelah halaman baca berjalan di peramban. Pemindai
 * tautan kantor hanya mengambil HTML, jadi tidak ikut terhitung.
 */
export function CatatKlik({ slug, token }: { slug: string; token: string }) {
  useEffect(() => {
    void fetch(`/e/${encodeURIComponent(slug)}/api/jejak/klik`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
      keepalive: true,
    }).catch(() => null);
  }, [slug, token]);
  return null;
}
