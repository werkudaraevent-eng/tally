/**
 * Nomor telepon di "Crew contact" bus (Logistics > Buses). Isiannya teks bebas
 * panitia, mis. "Hadi - 0811 2836 676" atau "Pak Budi +62 812-3456-7890".
 * Hanya nomor ponsel Indonesia (0 8…, 62 8…, +62 8…, 0062 8…) yang dipakai
 * untuk tombol Telepon dan WhatsApp: angka lain di sekitarnya (nomor sopir,
 * nama bus, tanggal, "24 jam") tidak ikut digabung. Teks aslinya tetap
 * ditampilkan apa adanya. Tanpa nomor yang jelas: tanpa tombol, agar tombol
 * tidak pernah memanggil nomor yang salah.
 */
export type NomorKru = { tel: string; wa: string };

// Awalan, lalu 8 dan sisa nomor dalam kelompok yang dipisah satu spasi, titik,
// atau tanda hubung (tidak menyeberang baris). Tidak boleh menempel ke angka lain.
const PONSEL = /(?<![\d+])(?:(?:\+|00)?62[ \t.-]?(?:\(0\)[ \t]?|0)?|0)8\d{1,3}(?:[ \t.-]?\d{2,5}){1,3}(?!\d)/;

export function nomorKru(teks: string | null | undefined): NomorKru | null {
  const cocok = (teks ?? "").match(PONSEL);
  if (!cocok) return null;
  let angka = cocok[0].replace(/\D/g, "");
  if (angka.startsWith("00")) angka = angka.slice(2);
  // Nomor nasional tanpa 0 dan tanpa 62: 8xx..., 9 sampai 12 digit.
  const nasional = angka.startsWith("62") ? angka.slice(2).replace(/^0/, "") : angka.slice(1);
  if (!nasional.startsWith("8") || nasional.length < 9 || nasional.length > 12) return null;
  return { tel: `+62${nasional}`, wa: `https://wa.me/62${nasional}` };
}
