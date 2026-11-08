import { ukuranBaru } from "@/lib/bagasi/ukuran";

/**
 * Berkas untuk "Read with AI" disiapkan di browser sebelum dikirim.
 *
 * Vercel menolak badan permintaan di atas 4,5 MB sebelum route berjalan, dan
 * satu foto kamera ponsel sudah 3 sampai 5 MB. Foto dikecilkan ke sisi
 * terpanjang 1600 px, JPEG 0,8: sekitar 200 sampai 400 KB, masih cukup tajam
 * untuk membaca nomor kamar dan nama di foto kartu kunci atau screenshot chat.
 * HEIC iPhone ikut diubah ke JPEG bila browser bisa membukanya (Safari bisa);
 * bila tidak, berkasnya dikirim apa adanya dan server menjelaskan caranya.
 */

export const BATAS_KIRIM = 4 * 1024 * 1024;
const SISI = 1600;
const FOTO = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

async function kecilkan(berkas: File): Promise<File> {
  try {
    const gambar = await createImageBitmap(berkas, { imageOrientation: "from-image" });
    const { lebar, tinggi } = ukuranBaru(gambar.width, gambar.height, SISI);
    const kanvas = document.createElement("canvas");
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const konteks = kanvas.getContext("2d");
    if (!konteks) { gambar.close(); return berkas; }
    konteks.fillStyle = "#fff";
    konteks.fillRect(0, 0, lebar, tinggi);
    konteks.drawImage(gambar, 0, 0, lebar, tinggi);
    gambar.close();
    const hasil = await new Promise<Blob | null>((selesai) => kanvas.toBlob(selesai, "image/jpeg", 0.8));
    if (!hasil || (hasil.size >= berkas.size && /\.jpe?g$/i.test(berkas.name))) return berkas;
    return new File([hasil], berkas.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return berkas;
  }
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Foto dikecilkan; hasilnya berkas siap kirim, atau kalimat yang menjelaskan kenapa terlalu besar. */
export async function siapkanBerkas(files: File[]): Promise<{ files: File[] } | { galat: string }> {
  const hasil = await Promise.all(files.map((f) => (FOTO.test(f.name) ? kecilkan(f) : Promise.resolve(f))));
  const besar = hasil.find((f) => f.size > BATAS_KIRIM);
  if (besar) return { galat: `${besar.name} is ${mb(besar.size)}; AI can take up to 4 MB at a time. Split the PDF into fewer pages, or send a photo or screenshot of the page instead.` };
  const total = hasil.reduce((n, f) => n + f.size, 0);
  if (total > BATAS_KIRIM) return { galat: `These files are ${mb(total)} together; AI can take up to 4 MB at a time. Choose fewer files and read the rest in a second go.` };
  return { files: hasil };
}
