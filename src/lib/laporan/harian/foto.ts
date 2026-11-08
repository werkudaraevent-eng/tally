/**
 * Foto highlight harian diunggah lewat /api/display/background ke folder
 * `laporan` di bucket public-read `display-assets`, sama dengan foto
 * pengumuman. Server hanya menerima URL dari folder itu.
 */
export const FOLDER_FOTO_LAPORAN = "laporan";

export function fotoLaporanSah(url: string, supabaseUrl: string | undefined | null): boolean {
  const dasar = supabaseUrl?.trim().replace(/\/+$/, "");
  if (!dasar) return false;
  const awalan = `${dasar}/storage/v1/object/public/display-assets/${FOLDER_FOTO_LAPORAN}/`;
  if (url.length > 1000 || !url.startsWith(awalan)) return false;
  const sisa = url.slice(awalan.length);
  return /^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(sisa) && !sisa.includes("..");
}
