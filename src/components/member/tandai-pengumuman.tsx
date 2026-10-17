"use client";

import { useEffect } from "react";

/**
 * Tab Pengumuman portal gathering tampil: semua pengumuman sampai saat ini
 * ditandai terbaca (U-03), sama dengan lonceng halaman acara. Bukan di setiap
 * render portal: peserta yang langsung membuka QR atau Jadwal belum membaca
 * apa pun. Chip "Baru" di daftar yang sedang terbuka tetap, karena daftarnya
 * dirender dengan batas lama.
 */
export function TandaiPengumumanDibaca({ slug }: { slug: string }) {
  useEffect(() => {
    void fetch(`/e/${encodeURIComponent(slug)}/api/peserta/pengumuman`, { method: "POST" }).catch(() => null);
  }, [slug]);
  return null;
}
