/**
 * Jenis gambar dari isi berkasnya, bukan dari `file.type`.
 *
 * `file.type` ditulis klien. Berkas teks yang dikirim dengan label image/png
 * lolos pemeriksaan lama dan tersimpan sebagai .png. Tiga tanda tangan di
 * bawah adalah satu-satunya format gambar yang diterima unggahan Tally; tiap
 * route masih menyaring lagi format yang ia izinkan.
 */
export function jenisGambarDariIsi(awal: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const cocok = (offset: number, bytes: number[]) => bytes.every((b, i) => awal[offset + i] === b);
  if (cocok(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (cocok(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (cocok(0, [0x52, 0x49, 0x46, 0x46]) && cocok(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}
