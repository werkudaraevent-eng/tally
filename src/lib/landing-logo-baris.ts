// Pembagian baris logo di blok Logo (rata Tengah dan Kanan) supaya tidak ada
// satu logo yang tertinggal sendirian di baris bawah.

/** Isi baris yang rata: sesedikit mungkin baris, lalu logo dibagi sama banyak ke tiap baris. */
export function logoPerBaris(jumlah: number, maks: number): number {
  if (jumlah <= maks) return Math.max(jumlah, 1);
  return Math.ceil(jumlah / Math.ceil(jumlah / maks));
}

/** Isi tiap baris, urut dari atas: sesedikit mungkin baris, baris atas mendapat sisa bagi. */
export function barisLogo(jumlah: number, maks: number): number[] {
  if (jumlah <= maks) return [Math.max(jumlah, 1)];
  const baris = Math.ceil(jumlah / maks);
  const dasar = Math.floor(jumlah / baris);
  return Array.from({ length: baris }, (_, i) => dasar + (i < jumlah % baris ? 1 : 0));
}

/**
 * Ponsel: isi tiap baris, urut dari atas. Jumlah genap dua sebaris; jumlah
 * ganjil memakai baris bertiga di atas supaya tidak ada logo sendirian di
 * bawah (5 = 3 + 2, 7 = 3 + 2 + 2).
 */
export function barisLogoPonsel(jumlah: number): number[] {
  if (jumlah > 3 && jumlah % 2 === 0) return Array.from({ length: jumlah / 2 }, () => 2);
  return barisLogo(jumlah, 3);
}
