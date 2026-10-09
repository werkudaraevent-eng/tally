/**
 * Format ringan untuk Details butir agenda: tebal, miring, warna tema, daftar
 * berbulet dan bernomor. Disimpan sebagai teks biasa dengan tanda, bukan HTML,
 * jadi tidak ada markup yang harus disanitasi sebelum dirender di halaman
 * publik, dan pembaca lain (pencocokan pembicara, dasbor, ringkasan admin)
 * cukup membuang tandanya lewat `teksPolos`.
 *
 * Tanda:
 * - `**tebal**`, `*miring*`, `==warna tema==` (boleh bertumpuk).
 * - Baris `- isi` = butir berbulet; baris `1. isi` = butir bernomor (nomor
 *   diurutkan ulang saat dirender).
 * - `\*`, `\=`, `\\`, serta `\-` dan `1\.` di awal baris = karakter apa adanya.
 *
 * Tanpa tanda dan tanpa baris daftar, teks tampil persis seperti sebelumnya
 * (`adaFormat` false): pemanggil memakai paragraf lama, 0 px.
 */

export type Potongan = { teks: string; tebal?: boolean; miring?: boolean; warna?: boolean };
export type Blok = { jenis: "p" | "ul" | "ol"; isi: Potongan[] };

const DAFTAR_BULET = /^- ([^]*)$/;
const DAFTAR_NOMOR = /^\d{1,2}\. ([^]*)$/;

/** Teks baris dipecah menjadi potongan bergaya. Tanda yang tidak berpasangan dibaca apa adanya. */
export function pecahBaris(baris: string): Potongan[] {
  const hasil: Potongan[] = [];
  const gaya = { tebal: false, miring: false, warna: false };
  let buffer = "";
  const dorong = () => {
    if (!buffer) return;
    const akhir = hasil[hasil.length - 1];
    const sama = akhir && !!akhir.tebal === gaya.tebal && !!akhir.miring === gaya.miring && !!akhir.warna === gaya.warna;
    if (sama) akhir.teks += buffer;
    else hasil.push({ teks: buffer, ...(gaya.tebal ? { tebal: true } : {}), ...(gaya.miring ? { miring: true } : {}), ...(gaya.warna ? { warna: true } : {}) });
    buffer = "";
  };
  // Tanda pembuka hanya berlaku bila penutupnya ada di baris yang sama.
  const adaPenutup = (dari: number, tanda: string) => {
    for (let j = dari; j < baris.length; j++) {
      if (baris[j] === "\\") {
        j++;
        continue;
      }
      if (baris.startsWith(tanda, j) && !(tanda === "*" && baris.startsWith("**", j))) return true;
    }
    return false;
  };
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (c === "\\" && i + 1 < baris.length && /[\\*=.-]/.test(baris[i + 1])) {
      buffer += baris[i + 1];
      i++;
      continue;
    }
    if (baris.startsWith("**", i) && (gaya.tebal || adaPenutup(i + 2, "**"))) {
      dorong();
      gaya.tebal = !gaya.tebal;
      i++;
      continue;
    }
    if (baris.startsWith("==", i) && (gaya.warna || adaPenutup(i + 2, "=="))) {
      dorong();
      gaya.warna = !gaya.warna;
      i++;
      continue;
    }
    if (c === "*" && (gaya.miring || adaPenutup(i + 1, "*"))) {
      dorong();
      gaya.miring = !gaya.miring;
      continue;
    }
    buffer += c;
  }
  dorong();
  return hasil;
}

/** Details dipecah menjadi blok: paragraf satu baris, atau butir daftar. */
export function pecahTeks(nilai: string | null | undefined): Blok[] {
  const blok: Blok[] = [];
  for (const mentah of (nilai ?? "").split("\n")) {
    const bulet = DAFTAR_BULET.exec(mentah);
    const nomor = bulet ? null : DAFTAR_NOMOR.exec(mentah);
    const isi = bulet?.[1] ?? nomor?.[1] ?? mentah;
    blok.push({ jenis: bulet ? "ul" : nomor ? "ol" : "p", isi: pecahBaris(isi) });
  }
  return blok;
}

/** Ada tanda atau baris daftar: Details perlu dirender sebagai teks berformat. */
export function adaFormat(nilai: string | null | undefined): boolean {
  if (!nilai) return false;
  if (/\\[\\*=.-]/.test(nilai)) return true;
  return pecahTeks(nilai).some((b) => b.jenis !== "p" || b.isi.some((p) => p.tebal || p.miring || p.warna));
}

function lindungi(teks: string, awalBaris: boolean): string {
  const aman = teks.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/=/g, "\\=");
  // "- " atau "1. " yang diketik di paragraf biasa bukan daftar.
  if (awalBaris && /^(- |\d{1,2}\. )/.test(aman)) return aman.replace(/^(\d{1,2})\. /, "$1\\. ").replace(/^- /, "\\- ");
  return aman;
}

/** Kebalikan pecahTeks: blok ke teks bertanda. Nomor daftar ditulis berurutan. */
export function susunTeks(blok: Blok[]): string {
  let nomor = 0;
  return blok
    .map((b) => {
      nomor = b.jenis === "ol" ? nomor + 1 : 0;
      let isi = "";
      b.isi.forEach((p, index) => {
        let teks = lindungi(p.teks, index === 0 && b.jenis === "p");
        if (!teks.trim()) {
          isi += teks;
          return;
        }
        // Spasi di tepi tetap di luar tanda: "**kata**" bukan "** kata **".
        const [, kiri, inti, kanan] = teks.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
        teks = inti;
        if (p.miring) teks = `*${teks}*`;
        if (p.tebal) teks = `**${teks}**`;
        if (p.warna) teks = `==${teks}==`;
        isi += kiri + teks + kanan;
      });
      return b.jenis === "ul" ? `- ${isi}` : b.jenis === "ol" ? `${nomor}. ${isi}` : isi;
    })
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Teks tanpa tanda, untuk pembaca yang tidak menggambar format (dasbor,
 * ringkasan, pencocokan pembicara). Butir daftar diberi "• " / "1. ".
 */
export function teksPolos(nilai: string | null | undefined): string {
  if (!nilai) return "";
  if (!adaFormat(nilai)) return nilai;
  let nomor = 0;
  return pecahTeks(nilai)
    .map((b) => {
      nomor = b.jenis === "ol" ? nomor + 1 : 0;
      const isi = b.isi.map((p) => p.teks).join("");
      return b.jenis === "ul" ? `• ${isi}` : b.jenis === "ol" ? `${nomor}. ${isi}` : isi;
    })
    .join("\n");
}
