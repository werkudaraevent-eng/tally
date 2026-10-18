/**
 * Alamat di dalam QR checkpoint (scan mandiri, migrasi 202610180001):
 * `<asal>/e/<slug>/pindai?s=<id sesi>&k=<kode>`.
 *
 * Berupa tautan, bukan kode polos, supaya kamera bawaan ponsel juga bisa
 * membukanya. Pemindai di halaman peserta membaca alamat yang sama. Berkas ini
 * tanpa `node:crypto`, karena dipakai juga di peramban.
 */

export function alamatQrCheckpoint(asal: string, slug: string, sesiId: number, kode: string): string {
  return `${asal}/e/${encodeURIComponent(slug)}/pindai?s=${sesiId}&k=${encodeURIComponent(kode)}`;
}

/** Isi QR yang terbaca kamera. Null: bukan QR checkpoint Tally. */
export function bacaQrCheckpoint(teks: string): { slug: string | null; sesi: number; kode: string } | null {
  let url: URL;
  try {
    url = new URL(teks.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const cocok = url.pathname.match(/^(?:\/e\/([^/]+))?\/pindai\/?$/);
  if (!cocok) return null;
  const sesi = Number(url.searchParams.get("s"));
  const kode = url.searchParams.get("k") ?? "";
  if (!Number.isSafeInteger(sesi) || sesi <= 0 || !/^[A-Za-z0-9_-]{8,40}$/.test(kode)) return null;
  let slug: string | null = null;
  if (cocok[1]) {
    try {
      slug = decodeURIComponent(cocok[1]);
    } catch {
      return null;
    }
  }
  return { slug, sesi, kode };
}
