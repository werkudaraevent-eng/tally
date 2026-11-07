/**
 * Alamat Kilas balik. Fungsi murni (alur.check.ts).
 *
 * `/e/<slug>/kilas-balik`, versi bahasa lain `/e/<slug>/en/kilas-balik`
 * (src/proxy.ts mengisi `?bahasa=`). Tautan ini yang ditempel panitia di
 * Pengumuman; peserta yang belum masuk dibawa ke Masuk dengan `?lanjut=`, lalu
 * kembali ke sini sesudah masuk.
 */
export function alamatKilasBalik(slug: string, bahasa: "id" | "en" | null = null): string {
  return bahasa ? `/e/${slug}/${bahasa}/kilas-balik` : `/e/${slug}/kilas-balik`;
}

/** `?lanjut=` yang sah untuk Kilas balik acara ini, atau null. Tidak pernah alamat lain. */
export function lanjutKilasBalik(slug: string, mentah: unknown): string | null {
  if (typeof mentah !== "string") return null;
  for (const calon of [alamatKilasBalik(slug), alamatKilasBalik(slug, "id"), alamatKilasBalik(slug, "en")]) if (mentah === calon) return calon;
  return null;
}
