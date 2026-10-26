/**
 * Pilihan kelompok di agenda halaman acara sebelum masuk ("Semua · Batch 1 ·
 * Batch 2"), pola filter track Sched dan Whova. Baris berlabel (lihat
 * labelAgendaPublik di sasaran-baris.ts) membawa jawabannya per kelompok;
 * satu kelompok = satu pertanyaan yang jawabannya boleh tampil, tanpa nama
 * atau kunci pertanyaannya (yang dikirim hanya nomor urut).
 *
 * Murni, supaya bisa diuji langsung oleh Node (agenda-kelompok.check.ts).
 */

/** Jawaban satu baris di satu kelompok. `grup` = indeks ke daftar pilihan acara. */
export type KelompokBaris = { grup: number; nilai: string[] };

/** Pilihan tamu per kelompok: indeks kelompok → jawaban terpilih. Kosong = Semua. */
export type PilihanKelompok = Record<number, string>;

/**
 * Baris ini tampil untuk pilihan tamu? Baris tanpa kelompok (untuk semua, atau
 * bersyarat tanpa label) selalu tampil. Baris berkelompok tampil bila, untuk
 * setiap kelompok yang dipilih, jawabannya ada di baris itu.
 */
export function barisCocok(kelompok: ReadonlyArray<KelompokBaris> | null | undefined, pilihan: PilihanKelompok): boolean {
  if (!kelompok || kelompok.length === 0) return true;
  return kelompok.every((isi) => {
    const dipilih = pilihan[isi.grup];
    return dipilih === undefined || isi.nilai.includes(dipilih);
  });
}

/** Label baris disembunyikan bila setiap kelompoknya sudah dipilih: tamu sudah tahu batch-nya. */
export function labelTerjawab(kelompok: ReadonlyArray<KelompokBaris> | null | undefined, pilihan: PilihanKelompok): boolean {
  return Boolean(kelompok?.length) && kelompok!.every((isi) => pilihan[isi.grup] !== undefined);
}

/**
 * Pilihan yang masih sah: jawaban yang hilang dari daftar (pertanyaan diubah
 * sesudah tamu memilih) dibuang, supaya agenda tidak kosong karena pilihan lama.
 */
export function pilihanSah(pilihan: PilihanKelompok, daftar: ReadonlyArray<ReadonlyArray<string>>): PilihanKelompok {
  const hasil: PilihanKelompok = {};
  for (const [grup, nilai] of Object.entries(pilihan)) {
    if (daftar[Number(grup)]?.includes(nilai)) hasil[Number(grup)] = nilai;
  }
  return hasil;
}
