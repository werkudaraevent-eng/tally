/**
 * Nomor telepon di "Crew contact" bus (Logistics > Buses). Isiannya teks bebas
 * panitia, mis. "Hadi - 0811 2836 676" atau "Pak Budi +62 812-3456-7890".
 * Nomor pertama yang terbaca dipakai untuk tombol Telepon dan WhatsApp; teks
 * aslinya tetap ditampilkan apa adanya. Tanpa nomor: tanpa tombol.
 */
export type NomorKru = { tel: string; wa: string };

export function nomorKru(teks: string | null | undefined): NomorKru | null {
  const cocok = (teks ?? "").match(/\+?\d[\d\s().-]{6,}\d/);
  if (!cocok) return null;
  const plus = cocok[0].startsWith("+");
  const angka = cocok[0].replace(/\D/g, "");
  if (angka.length < 8 || angka.length > 15) return null;
  // Nomor lokal Indonesia (0812...) menjadi 62812... untuk wa.me; nomor
  // berawalan + atau 62 dipakai apa adanya.
  const internasional = plus || angka.startsWith("62") ? angka : angka.startsWith("0") ? `62${angka.slice(1)}` : angka;
  return { tel: plus ? `+${angka}` : angka, wa: `https://wa.me/${internasional}` };
}
