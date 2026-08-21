/**
 * Alamat halaman kode peserta.
 *
 * Dibangun dari origin PERMINTAAN, bukan dari variabel lingkungan. Aplikasi ini
 * dilayani di beberapa alamat sekaligus — domain produksi, pratinjau Vercel, dan
 * localhost — dan alamat yang dipatok di env akan mengirim pendaftar ke domain
 * yang salah pada dua di antaranya. Pola yang sama dipakai /api/seat-map/qr.
 */
export function registrationCodeUrl(requestUrl: string, slug: string, token: string | null | undefined) {
  if (!token) return null;
  return new URL(`/e/${encodeURIComponent(slug)}/kode/${token}`, new URL(requestUrl).origin).toString();
}
