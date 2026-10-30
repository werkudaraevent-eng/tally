/**
 * Bagasi satu peserta, diringkas untuk kolom Luggage di daftar peserta,
 * saringannya, dan Export. Murni, supaya bisa diuji lewat `npm run check`.
 *
 * Peserta bisa menitip di beberapa meja (batch berangkat dan pulang), jadi
 * ringkasannya menjumlahkan semua catatannya di acara itu.
 */

/** Satu baris `luggage_drops` sejauh yang dibutuhkan ringkasan. */
export type BarisRingkasBagasi = {
  participant_id: string;
  bag_count: number;
  recorded_at: string;
  photo_path: string | null;
  /** Tidak ada sebelum migrasi 202610240001. */
  handed_over_at?: string | null;
};

export type RingkasBagasi = {
  bags: number;
  /** Koper dari catatan yang belum diserahkan kembali. */
  waiting: number;
  /** Catatan dengan foto. */
  photos: number;
  /** Titip pertama, ISO. */
  first: string;
};

/** Nilai kolom Luggage yang bisa disaring. Kosong = tidak pernah ke meja bagasi. */
export const STATUS_BAGASI = ["At the desk", "Handed back", "No luggage"] as const;
export type StatusBagasi = (typeof STATUS_BAGASI)[number] | "";

export function ringkasBagasi(baris: BarisRingkasBagasi[]): Map<string, RingkasBagasi> {
  const hasil = new Map<string, RingkasBagasi>();
  for (const item of baris) {
    const lama = hasil.get(item.participant_id);
    const tunggu = item.handed_over_at ? 0 : item.bag_count;
    if (!lama) {
      hasil.set(item.participant_id, { bags: item.bag_count, waiting: tunggu, photos: item.photo_path ? 1 : 0, first: item.recorded_at });
      continue;
    }
    lama.bags += item.bag_count;
    lama.waiting += tunggu;
    if (item.photo_path) lama.photos += 1;
    if (item.recorded_at < lama.first) lama.first = item.recorded_at;
  }
  return hasil;
}

/**
 * "No luggage" bila ke meja tanpa koper (tombol "No luggage" di pemindai),
 * "At the desk" selama masih ada koper di meja, "Handed back" bila semuanya
 * sudah diserahkan di meja ambil.
 */
export function statusBagasi(ringkas: RingkasBagasi | undefined): StatusBagasi {
  if (!ringkas) return "";
  if (ringkas.bags === 0) return "No luggage";
  return ringkas.waiting > 0 ? "At the desk" : "Handed back";
}

/** Teks sel di tabel: "3 · At the desk". */
export function labelBagasi(ringkas: RingkasBagasi | undefined): string {
  const status = statusBagasi(ringkas);
  if (!ringkas || status === "" || status === "No luggage") return status;
  return `${ringkas.bags} · ${status}`;
}
