// Urutan baris rundown di CMS dan di halaman publik: jam mulai dulu, lalu
// `sort_order` untuk baris berjam mulai sama (sesi paralel), lalu id.
//
// Modul ini sengaja tanpa impor supaya bisa diuji langsung dengan node
// (lihat rundown-urutan.check.ts) dan dipakai bersama oleh CMS dan API.

export type BarisUrut = { id: number; start_time: string; sort_order: number };

/**
 * Kunci slot: baris berjam mulai sama berbagi slot. Jam dibakukan ke "HH:MM:SS"
 * (kolom `time` di database), karena suntingan di CMS mengirim "HH:MM". Detiknya
 * ikut dibandingkan supaya urutan CMS sama persis dengan `.order("start_time")`
 * di halaman publik.
 */
export function kunciSlot(startTime: string): string {
  return startTime.length === 5 ? `${startTime}:00` : startTime;
}

/** Pembanding urutan jadwal: jam mulai, sort_order, lalu id. */
export function bandingkanBaris(a: BarisUrut, b: BarisUrut): number {
  return kunciSlot(a.start_time).localeCompare(kunciSlot(b.start_time)) || a.sort_order - b.sort_order || a.id - b.id;
}

/**
 * Menyusun ulang satu slot jam sesuai urutan `idSlot`, lalu memberi nomor
 * `sort_order` baru 1..n ke seluruh bagian.
 *
 * Seluruh bagian dinomori ulang, bukan hanya slotnya: data lama bisa punya
 * `sort_order` kembar, dan menukar dua nilai kembar tidak mengubah apa pun.
 * Yang dikembalikan hanya baris yang nomornya berubah, supaya penulisan ke
 * database sesedikit mungkin.
 *
 * Mengembalikan null bila `idSlot` bukan persis seluruh baris satu slot.
 */
export function susunUlangSlot(baris: BarisUrut[], idSlot: number[]): Array<{ id: number; sort_order: number }> | null {
  if (idSlot.length < 2 || new Set(idSlot).size !== idSlot.length) return null;
  const urut = [...baris].sort(bandingkanBaris);
  const pertama = urut.find((row) => row.id === idSlot[0]);
  if (!pertama) return null;
  const slot = kunciSlot(pertama.start_time);
  const anggota = urut.filter((row) => kunciSlot(row.start_time) === slot);
  if (anggota.length !== idSlot.length || !anggota.every((row) => idSlot.includes(row.id))) return null;

  const perId = new Map(urut.map((row) => [row.id, row]));
  let giliran = 0;
  const baru = urut.map((row) => (kunciSlot(row.start_time) === slot ? perId.get(idSlot[giliran++])! : row));
  return baru
    .map((row, index) => ({ id: row.id, sort_order: index + 1, lama: row.sort_order }))
    .filter((row) => row.sort_order !== row.lama)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

/**
 * Urutan id slot sesudah satu baris digeser satu langkah ke atas (-1) atau ke
 * bawah (+1). Null bila baris sudah di ujung slot.
 */
export function geserDalamSlot(idSlot: number[], id: number, arah: -1 | 1): number[] | null {
  const posisi = idSlot.indexOf(id);
  const tujuan = posisi + arah;
  if (posisi < 0 || tujuan < 0 || tujuan >= idSlot.length) return null;
  const hasil = [...idSlot];
  [hasil[posisi], hasil[tujuan]] = [hasil[tujuan], hasil[posisi]];
  return hasil;
}

/** Memindahkan baris `id` ke posisi `ke` di dalam slot (untuk seret dan lepas). */
export function pindahDalamSlot(idSlot: number[], id: number, ke: number): number[] | null {
  const posisi = idSlot.indexOf(id);
  if (posisi < 0 || ke < 0 || ke >= idSlot.length || ke === posisi) return null;
  const hasil = idSlot.filter((other) => other !== id);
  hasil.splice(ke, 0, id);
  return hasil;
}
