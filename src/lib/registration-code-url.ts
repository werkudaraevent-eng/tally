/**
 * Alamat halaman kode peserta.
 *
 * `origin` diambil dari linkOrigin() (src/lib/domain-klien/asal.ts): domain
 * klien bila aktif, alamat Tally di produksi, origin permintaan di pratinjau dan
 * localhost. Menerima URL apa pun; hanya origin-nya yang dipakai.
 */
export function registrationCodeUrl(origin: string, slug: string, token: string | null | undefined) {
  if (!token) return null;
  return new URL(`/e/${encodeURIComponent(slug)}/kode/${token}`, new URL(origin).origin).toString();
}
