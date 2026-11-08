/**
 * PDF kecil dari gambar JPEG: satu gambar = satu halaman seukuran gambar itu.
 * Dipakai tombol Download PDF Event report, karena dialog cetak Chrome
 * Android mengabaikan `@page size` dan menaruh slide 16:9 di kertas Letter
 * tegak (sisa putih atas-bawah). Tanpa pustaka: JPEG masuk apa adanya
 * (DCTDecode), sisanya hanya teks objek dan tabel xref.
 */
export type HalamanJpeg = { jpeg: Uint8Array; lebarPx: number; tinggiPx: number };

const enc = new TextEncoder();

/** Ukuran halaman dalam point (1/72 inci). */
export function pdfDariJpeg(halaman: HalamanJpeg[], halamanPt: { lebar: number; tinggi: number }): Uint8Array {
  const bagian: Uint8Array[] = [];
  const offset: number[] = [];
  let panjang = 0;
  const tulis = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    bagian.push(u);
    panjang += u.length;
  };
  const objek = (n: number, isi: () => void) => {
    offset[n] = panjang;
    tulis(`${n} 0 obj\n`);
    isi();
    tulis("\nendobj\n");
  };

  const { lebar: W, tinggi: H } = halamanPt;
  // 1 katalog, 2 daftar halaman, lalu per halaman: halaman, gambar, isi.
  const nHal = (i: number) => 3 + i * 3;
  tulis("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  objek(1, () => tulis("<< /Type /Catalog /Pages 2 0 R >>"));
  objek(2, () => tulis(`<< /Type /Pages /Count ${halaman.length} /Kids [${halaman.map((_, i) => `${nHal(i)} 0 R`).join(" ")}] >>`));
  halaman.forEach((h, i) => {
    const n = nHal(i);
    const isi = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    objek(n, () => tulis(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`));
    objek(n + 1, () => {
      tulis(`<< /Type /XObject /Subtype /Image /Width ${h.lebarPx} /Height ${h.tinggiPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${h.jpeg.length} >>\nstream\n`);
      tulis(h.jpeg);
      tulis("\nendstream");
    });
    objek(n + 2, () => tulis(`<< /Length ${isi.length} >>\nstream\n${isi}\nendstream`));
  });
  const total = 3 + halaman.length * 3;
  const xref = panjang;
  tulis(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) tulis(`${String(offset[n]).padStart(10, "0")} 00000 n \n`);
  tulis(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const hasil = new Uint8Array(panjang);
  let p = 0;
  for (const b of bagian) {
    hasil.set(b, p);
    p += b.length;
  }
  return hasil;
}

/** Ukuran JPEG (lebar, tinggi) dari penanda SOF; null bila bukan JPEG. */
export function ukuranJpeg(b: Uint8Array): { lebar: number; tinggi: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { tinggi: (b[i + 5] << 8) | b[i + 6], lebar: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}
