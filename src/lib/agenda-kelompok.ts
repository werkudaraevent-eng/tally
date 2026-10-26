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

/** Satu baris tombol pilihan: kelompok yang berbagi jawaban digabung jadi satu. */
export type BarisPilihan = { grup: number[]; daftar: string[] };

/**
 * Baris tombol yang tampil di satu hari. Pertanyaan berlabel yang berbagi
 * jawaban ("Batch keberangkatan" dan "Batch kepulangan", keduanya memakai
 * "Batch 1") menjadi satu baris tombol berisi gabungan jawabannya: memilih
 * "Batch 1" mengisi keduanya. Nama pertanyaan tidak dikirim ke halaman publik,
 * jadi dua baris "Semua · Batch 1 · Batch 2" yang kembar tidak bisa dibedakan
 * tamu. `dipakai` (kelompok yang muncul di baris hari itu) menyembunyikan
 * pertanyaan yang tidak dipakai hari itu; kosong/null = tampilkan semua.
 */
export function barisPilihan(pilihan: ReadonlyArray<ReadonlyArray<string>>, dipakai?: ReadonlySet<number> | null): BarisPilihan[] {
  const hasil: BarisPilihan[] = [];
  pilihan.forEach((daftar, grup) => {
    const sama = hasil.filter((baris) => daftar.some((nilai) => baris.daftar.includes(nilai)));
    const gabung: BarisPilihan = { grup: [...sama.flatMap((b) => b.grup), grup], daftar: [...sama.flatMap((b) => b.daftar)] };
    for (const nilai of daftar) if (!gabung.daftar.includes(nilai)) gabung.daftar.push(nilai);
    const pertama = sama.length > 0 ? hasil.indexOf(sama[0]) : hasil.length;
    for (const b of sama) hasil.splice(hasil.indexOf(b), 1);
    hasil.splice(Math.min(pertama, hasil.length), 0, gabung);
    gabung.grup.sort((x, y) => x - y);
  });
  // Urutan pilihan satu pertanyaan dipakai apa adanya; gabungan dua pertanyaan diurutkan alami ("Batch 2" sebelum "Batch 10").
  for (const baris of hasil) if (baris.grup.length > 1) baris.daftar.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  if (!dipakai || dipakai.size === 0) return hasil;
  return hasil.filter((baris) => baris.grup.some((g) => dipakai.has(g)));
}
