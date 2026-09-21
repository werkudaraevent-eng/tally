/**
 * Tanda baca yang dipakai antarmuka, ditulis SEKALI sebagai karakter asli.
 *
 * ---- Kenapa konstanta, bukan diketik di tempatnya ------------------------
 *
 * Bukan soal menghemat ketikan. Karakter-karakter ini pernah ditulis sebagai
 * escape (`·`, `—`) dan hasilnya berbeda tergantung DI MANA ia berada:
 *
 *   * Di dalam string JavaScript — `{x ?? "—"}` — escape itu bekerja.
 *   * Di dalam teks JSX — `<span>—</span>` — ia BUKAN escape. JSX
 *     memperlakukan isi elemen sebagai teks apa adanya, jadi yang tampil adalah
 *     enam huruf: backslash, u, 2, 0, 1, 4.
 *
 * Bedanya tidak terlihat saat menulis, tidak tertangkap TypeScript, dan tidak
 * tertangkap build. Ia hanya terlihat di layar, dan dua kali sudah lolos sampai
 * ke tangan pengguna. Konstanta menghapus keputusannya: tidak ada tempat lagi
 * untuk memilih bentuk yang salah.
 *
 * Aturan lint `no-restricted-syntax` di eslint.config.mjs menjaga agar escape
 * di teks JSX gagal sejak awal, bukan setelah dilihat orang.
 */

/** Pemisah antar potongan metadata: "Hotel Mulia · 31 hari lalu". */
export const SEPARATOR = "·";

/** Nilai yang tidak ada. Bukan "-" (tanda hubung) dan bukan "–" (en dash). */
export const EMPTY_VALUE = "—";

/** Rentang angka dan tanggal: "1–25", "Nama A–Z". */
export const EN_DASH = "–";

/** Teks yang dipotong. Satu karakter, bukan tiga titik berturut-turut. */
export const ELLIPSIS = "…";

/**
 * Menyambung metadata dengan pemisah, MELEWATI yang kosong.
 *
 * Fungsi, bukan `array.join`: `join` tetap menulis pemisah di antara dua nilai
 * kosong, dan yang terlihat adalah "Rabu, 9 Sep 2026 · · " dengan titik
 * menggantung di ujung. Itu terjadi di setiap baris acara yang belum punya
 * lokasi, dan di setiap acara draft yang belum punya status pendaftaran.
 */
export function gabungMeta(items: Array<string | null | undefined | false>): string {
  return items.filter(Boolean).join(` ${SEPARATOR} `);
}
