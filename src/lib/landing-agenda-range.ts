import type { AgendaPreview } from "./landing-agenda";

/**
 * Jam selesai satu bagian rundown: jam paling akhir di antara semua sesi (jam
 * akhirnya, atau jam mulainya bila jam akhir tidak diisi). Bukan baris terakhir:
 * sesi paralel yang lebih panjang bisa berada di atas baris terakhir. Berkas terpisah dari `landing-agenda.ts` karena
 * dipakai juga oleh komponen klien, dan berkas itu membawa klien Supabase
 * service-role yang tidak boleh ikut ke peramban.
 */
export function rentangAkhir(bagian: AgendaPreview): string | null {
  let akhir: string | null = null;
  for (const item of bagian.items) {
    // Jam berformat HH:MM atau HH.MM yang selalu dua digit, jadi bisa dibandingkan sebagai teks.
    const jam = item.end || item.time || null;
    if (jam && (akhir === null || jam > akhir)) akhir = jam;
  }
  return akhir;
}
