import type { AgendaPreview } from "./landing-agenda";

/**
 * Jam selesai satu bagian rundown: jam akhir sesi terakhir, atau jam mulainya
 * bila jam akhir tidak diisi. Berkas terpisah dari `landing-agenda.ts` karena
 * dipakai juga oleh komponen klien, dan berkas itu membawa klien Supabase
 * service-role yang tidak boleh ikut ke peramban.
 */
export function rentangAkhir(bagian: AgendaPreview): string | null {
  const terakhir = bagian.items[bagian.items.length - 1];
  if (!terakhir) return null;
  return terakhir.end || terakhir.time || null;
}
