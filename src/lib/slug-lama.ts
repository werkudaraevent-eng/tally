/**
 * Alamat lama sebuah acara setelah slug-nya diganti. Fungsi murni, tanpa akses
 * database (petanya dibaca src/lib/slug-lama-peta.ts), supaya bisa diuji
 * langsung dengan Node.
 *
 * Slug masuk ke setiap tautan yang sudah tersebar: email konfirmasi dan atur
 * kata sandi, halaman QR kehadiran (`/e/<slug>/kode/<token>`), undangan,
 * portal yang disimpan peserta di layar utama, bookmark scanner dan layar.
 * Tabel event_slug_redirects menyimpan slug lama -> acara, dan proxy
 * mengalihkan ketiga bentuk alamat yang membawa slug ke slug sekarang:
 *
 *   /e/<lama>[/...]           -> /e/<baru>[/...]
 *   /peserta/e/<lama>[/...]   -> /peserta/e/<baru>[/...]
 *   ...?eventSlug=<lama>      -> ...?eventSlug=<baru>
 *
 * Sisa path dan query lain ikut utuh, jadi token di tautan tetap sama. Di
 * domain klien hanya slug lama milik acara domain itu yang dialihkan (proxy).
 * Tanda tangan undangan, sesi peserta dan domain klien memakai id acara.
 */

/** Slug lama -> slug acara sekarang. */
export type PetaSlugLama = ReadonlyMap<string, string>;

const POLA_PATH = /^(\/(?:peserta\/)?e\/)([^/]+)(\/.*)?$/;

/** Nilai query yang mungkin ber-encode; nilai yang rusak dibaca apa adanya. */
function bacaNilai(nilai: string): string {
  try {
    return decodeURIComponent(nilai.replace(/\+/g, " "));
  } catch {
    return nilai;
  }
}

/**
 * Path + query tujuan bila permintaan ini memakai slug lama, selain itu null.
 * `search` boleh berawalan "?" atau kosong. Query lain dibiarkan byte-identik:
 * hanya nilai `eventSlug` yang ditulis ulang, jadi token yang ber-encode tidak
 * pernah diubah bentuknya.
 */
export function alamatSlugBaru(pathname: string, search: string, peta: PetaSlugLama): string | null {
  if (peta.size === 0) return null;
  let path = pathname;
  let berubah = false;

  const cocok = pathname.match(POLA_PATH);
  if (cocok) {
    const baru = peta.get(bacaNilai(cocok[2]));
    if (baru) {
      path = `${cocok[1]}${encodeURIComponent(baru)}${cocok[3] ?? ""}`;
      berubah = true;
    }
  }

  const query = search.replace(/^\?/, "").replace(/(^|&)eventSlug=([^&]*)/g, (semua, awal: string, nilai: string) => {
    const baru = peta.get(bacaNilai(nilai));
    if (!baru) return semua;
    berubah = true;
    return `${awal}eventSlug=${encodeURIComponent(baru)}`;
  });

  if (!berubah) return null;
  return query ? `${path}?${query}` : path;
}

/**
 * Service worker portal (`/e/<lama>/peserta-sw.js`, src/app/peserta-sw.js) di
 * bawah slug lama. Alamat ini TIDAK dialihkan: peramban tidak pernah mengikuti
 * pengalihan saat memperbarui service worker, jadi worker lama di ponsel akan
 * tetap hidup selamanya bersama salinan QR luringnya (nama, perusahaan, bus,
 * QR). Ia diganti SKRIP_SW_PENSIUN yang menghapus salinan itu lalu melepas
 * dirinya sendiri.
 */
export function swSlugLama(pathname: string, peta: PetaSlugLama): boolean {
  const cocok = pathname.match(/^\/(?:peserta\/)?e\/([^/]+)\/(?:[^/]+\/)*peserta-sw\.js$/);
  return Boolean(cocok && peta.has(bacaNilai(cocok[1])));
}

/**
 * Pengganti service worker portal di slug lama. Nama cache dan kuncinya sama
 * dengan src/app/peserta-sw.js (lingkup + "?tally-qr-luring"). Tanpa handler
 * fetch, jadi halaman yang masih dikendalikannya langsung ke jaringan, dan
 * jaringan mengalihkannya ke slug baru.
 */
export const SKRIP_SW_PENSIUN = `self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open("tally-qr-luring-v1");
      await cache.delete(self.registration.scope + "?tally-qr-luring");
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
  })());
});
`;

/**
 * Peta dari baris tabel. Slug lama yang kini dipakai acara lain diabaikan:
 * acara yang hidup selalu menang, pengalihan tidak boleh membajak alamatnya.
 * Begitu juga slug lama yang menunjuk dirinya sendiri.
 */
export function petaSlugLama(baris: { old_slug: string; slug: string | null }[], slugHidup: ReadonlySet<string>): Map<string, string> {
  const peta = new Map<string, string>();
  for (const { old_slug, slug } of baris) {
    if (!slug || slug === old_slug || slugHidup.has(old_slug)) continue;
    peta.set(old_slug, slug);
  }
  return peta;
}
