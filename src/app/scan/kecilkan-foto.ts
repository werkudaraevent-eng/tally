import { ukuranBaru } from "@/lib/bagasi/ukuran";

/**
 * Mengecilkan foto kamera ponsel sebelum dikirim dari meja bagasi.
 *
 * Foto kamera 12 MP berukuran 3 sampai 5 MB. Di jaringan venue yang padat itu
 * belasan detik per tamu, dan antrean di belakangnya ikut menunggu. Sisi
 * terpanjang 1280 px dengan JPEG kualitas 0,7 tinggal sekitar 150 sampai 250 KB,
 * dan tetap cukup tajam untuk mengenali koper dan label namanya.
 *
 * `createImageBitmap` dengan `imageOrientation: "from-image"` memutar foto
 * sesuai EXIF-nya, jadi foto tegak tidak tersimpan miring.
 */
export const KUALITAS = 0.7;

export async function kecilkanFoto(berkas: Blob): Promise<Blob> {
  const gambar = await createImageBitmap(berkas, { imageOrientation: "from-image" });
  const { lebar, tinggi } = ukuranBaru(gambar.width, gambar.height);
  const kanvas = document.createElement("canvas");
  kanvas.width = lebar;
  kanvas.height = tinggi;
  const konteks = kanvas.getContext("2d");
  if (!konteks) throw new Error("NO_CANVAS");
  konteks.drawImage(gambar, 0, 0, lebar, tinggi);
  gambar.close();
  const hasil = await new Promise<Blob | null>((selesai) => kanvas.toBlob(selesai, "image/jpeg", KUALITAS));
  if (!hasil) throw new Error("NO_BLOB");
  return hasil;
}
