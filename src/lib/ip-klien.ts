/**
 * IP klien untuk batas laju. Di Vercel, `x-vercel-forwarded-for` dan
 * `x-real-ip` dipasang oleh Vercel sendiri dan tidak bisa diisi pengunjung;
 * `x-forwarded-for` bisa diawali nilai karangan pengunjung, jadi ia hanya
 * cadangan (elemen paling kiri, untuk server di luar Vercel).
 */
export function ipKlien(headers: Headers): string | null {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0].trim();
  if (vercel) return vercel;
  const nyata = headers.get("x-real-ip")?.trim();
  if (nyata) return nyata;
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
}
