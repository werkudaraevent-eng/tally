/**
 * Satu foto per pengumuman (migrasi 202611060001_pengumuman_foto).
 *
 * Fotonya diunggah lewat /api/display/background ke folder `pengumuman` di
 * bucket public-read `display-assets`, sama dengan gambar CMS lain. Server
 * hanya menerima URL dari folder itu: kolom ini tidak boleh menjadi jalan
 * memasang gambar dari situs lain (piksel pelacak di portal dan email peserta).
 */

export const FOLDER_FOTO_PENGUMUMAN = "pengumuman";
export const ALT_FOTO_MAX = 150;
export const URL_FOTO_MAX = 1000;

/** Awalan URL publik yang sah untuk foto pengumuman, dari URL Supabase proyek. */
export function awalanFotoPengumuman(supabaseUrl: string | undefined | null): string | null {
  const dasar = supabaseUrl?.trim().replace(/\/+$/, "");
  if (!dasar) return null;
  return `${dasar}/storage/v1/object/public/display-assets/${FOLDER_FOTO_PENGUMUMAN}/`;
}

/** true bila `url` adalah foto pengumuman yang diunggah lewat Tally. */
export function fotoPengumumanSah(url: string, supabaseUrl: string | undefined | null): boolean {
  const awalan = awalanFotoPengumuman(supabaseUrl);
  if (!awalan || url.length > URL_FOTO_MAX || !url.startsWith(awalan)) return false;
  const sisa = url.slice(awalan.length);
  // Satu nama berkas, tanpa ../, kueri, atau fragmen.
  return /^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(sisa) && !sisa.includes("..");
}

/** Teks alt: deskripsi panitia, atau judul pengumuman bila kosong (WCAG 1.1.1). */
export function altFotoPengumuman(item: { image_alt?: string | null; title: string }): string {
  return item.image_alt?.trim() || item.title;
}
