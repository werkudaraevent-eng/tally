import { landingPath, type LandingLang } from "@/lib/landing-i18n";

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

/**
 * Tautan email perlu alamat English: email English, halaman English acara
 * menyala, dan English bukan bahasa utamanya. Selain itu tautan tidak diubah,
 * jadi email Indonesia byte-identik, juga di acara berbahasa utama English.
 */
export function alamatEnglish(lang: LandingLang, utama: LandingLang, enTersedia: boolean) {
  return lang === "en" && utama !== "en" && enTersedia;
}

/** Alamat halaman kode dalam bahasa email: `/e/<slug>/en/kode/<token>` (lihat alamatEnglish). */
export function registrationCodeUrlIn(url: string | null | undefined, slug: string, lang: LandingLang, utama: LandingLang, enTersedia: boolean) {
  if (!url || !alamatEnglish(lang, utama, enTersedia)) return url ?? null;
  const alamat = new URL(url);
  const awalan = `/e/${encodeURIComponent(slug)}/kode/`;
  if (!alamat.pathname.startsWith(awalan)) return url;
  alamat.pathname = `${landingPath(encodeURIComponent(slug), lang, utama)}/kode/${alamat.pathname.slice(awalan.length)}`;
  return alamat.toString();
}

/**
 * Tautan konfirmasi akun di email English: `&bahasa=en`, supaya
 * /api/peserta/konfirmasi mengantar ke `/e/<slug>/en/peserta`. Aturan dan
 * jaminan byte-identik sama dengan registrationCodeUrlIn().
 */
export function confirmationUrlIn(url: string | null | undefined, lang: LandingLang, utama: LandingLang, enTersedia: boolean) {
  if (!url || !alamatEnglish(lang, utama, enTersedia)) return url ?? null;
  const alamat = new URL(url);
  alamat.searchParams.set("bahasa", lang);
  return alamat.toString();
}
