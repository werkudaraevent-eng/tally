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
 * Sisa path dan query lain ikut utuh, jadi token di tautan tetap sama. Tanda
 * tangan undangan, sesi peserta dan domain klien memakai id acara, bukan slug.
 */

/** Slug lama -> slug acara sekarang. */
export type PetaSlugLama = ReadonlyMap<string, string>;

const POLA_PATH = /^(\/(?:peserta\/)?e\/)([^/]+)(\/.*)?$/;

/**
 * Path + query tujuan bila permintaan ini memakai slug lama, selain itu null.
 * `search` boleh berawalan "?" atau kosong.
 */
export function alamatSlugBaru(pathname: string, search: string, peta: PetaSlugLama): string | null {
  if (peta.size === 0) return null;
  let path = pathname;
  let berubah = false;

  const cocok = pathname.match(POLA_PATH);
  if (cocok) {
    let slug: string;
    try {
      slug = decodeURIComponent(cocok[2]);
    } catch {
      slug = cocok[2];
    }
    const baru = peta.get(slug);
    if (baru) {
      path = `${cocok[1]}${encodeURIComponent(baru)}${cocok[3] ?? ""}`;
      berubah = true;
    }
  }

  const query = new URLSearchParams(search);
  const diminta = query.get("eventSlug");
  const baruQuery = diminta ? peta.get(diminta) : undefined;
  if (baruQuery) {
    query.set("eventSlug", baruQuery);
    berubah = true;
  }

  if (!berubah) return null;
  const sisa = baruQuery ? query.toString() : search.replace(/^\?/, "");
  return sisa ? `${path}?${sisa}` : path;
}

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
