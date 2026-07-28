// Terbilang: konversi angka rupiah ke kata bahasa Indonesia.
//
// Spec 7.2: kasir mengetik ulang nominal ke mesin EDC secara manual, jadi
// "angka total harus mustahil salah baca". Terbilang berfungsi sebagai
// verifikasi kedua terhadap angka besar (mis. Rp 650.002 vs Rp 6.500.002).

const UNITS = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

/** Mengubah bilangan bulat non-negatif menjadi kata (tanpa satuan mata uang). */
function spell(value: number): string {
  if (value < 12) return UNITS[value];
  if (value < 20) return `${spell(value - 10)} belas`;
  if (value < 100) {
    const rest = value % 10;
    return `${spell(Math.floor(value / 10))} puluh${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 200) {
    const rest = value - 100;
    return `seratus${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 1000) {
    const rest = value % 100;
    return `${spell(Math.floor(value / 100))} ratus${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 2000) {
    const rest = value - 1000;
    return `seribu${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 1_000_000) {
    const rest = value % 1000;
    return `${spell(Math.floor(value / 1000))} ribu${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 1_000_000_000) {
    const rest = value % 1_000_000;
    return `${spell(Math.floor(value / 1_000_000))} juta${rest ? ` ${spell(rest)}` : ""}`;
  }
  if (value < 1_000_000_000_000) {
    const rest = value % 1_000_000_000;
    return `${spell(Math.floor(value / 1_000_000_000))} miliar${rest ? ` ${spell(rest)}` : ""}`;
  }
  const rest = value % 1_000_000_000_000;
  return `${spell(Math.floor(value / 1_000_000_000_000))} triliun${rest ? ` ${spell(rest)}` : ""}`;
}

/**
 * Terbilang lengkap dengan satuan rupiah, mis.
 * 650002 -> "enam ratus lima puluh ribu dua rupiah"
 */
export function terbilangRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const value = Math.floor(Math.abs(amount));
  if (value === 0) return "nol rupiah";
  const words = spell(value).replace(/\s+/g, " ").trim();
  return `${amount < 0 ? "minus " : ""}${words} rupiah`;
}
