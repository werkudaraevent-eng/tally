/**
 * Keputusan proxy untuk domain klien. Fungsi murni (rute.check.ts); src/proxy.ts
 * yang menjalankannya.
 */

export type StatusPeta = "menunggu" | "aktif" | "bermasalah" | "dilepas";

export type KeputusanHost =
  | { kind: "penanda" }
  | { kind: "tolak" }
  | { kind: "alihkan"; to: string }
  | { kind: "layani"; pathname: string; addSlugQuery: boolean };

/**
 * Path yang TIDAK pernah dilayani di domain klien: ruang kerja panitia dan API
 * admin. Semua yang lain (halaman peserta, /e/<slug>/*, /api publik dan
 * peserta, aset) dilayani untuk acara pemilik domain itu saja.
 */
const DILARANG = [/^\/admin(\/|$)/, /^\/login(\/|$)/, /^\/booth(\/|$)/, /^\/cashier(\/|$)/, /^\/scan(\/|$)/, /^\/api\/(admin|cron|auth|settings|webhooks)(\/|$)/];

/** Singkatan di akar domain klien -> halaman acaranya. */
const SINGKATAN = /^\/(en|id)?\/?$/;

export function decideClientHost(input: {
  pathname: string;
  search: URLSearchParams;
  slug: string;
  status: StatusPeta;
  tallyOrigin: string | null;
}): KeputusanHost {
  const { pathname, search, slug, status, tallyOrigin } = input;
  if (pathname === "/.well-known/tally-domain") return { kind: "penanda" };

  const slugAman = encodeURIComponent(slug);
  // Path relatif terhadap acara: `/`, `/en` -> `/e/<slug>`, `/e/<slug>/en`.
  const singkatan = SINGKATAN.exec(pathname);
  const pathAcara = singkatan ? `/e/${slugAman}${singkatan[1] ? `/${singkatan[1]}` : ""}` : pathname;

  if (status === "dilepas") {
    if (!tallyOrigin) return { kind: "tolak" };
    const tujuan = pathAcara.startsWith(`/e/${slugAman}`) ? pathAcara : `/e/${slugAman}`;
    const query = search.toString();
    return { kind: "alihkan", to: `${tallyOrigin}${tujuan}${query ? `?${query}` : ""}` };
  }

  if (DILARANG.some((pola) => pola.test(pathname))) return { kind: "tolak" };
  const lain = /^\/e\/([^/]+)/.exec(pathname);
  if (lain && decodeURIComponent(lain[1]) !== slug) return { kind: "tolak" };
  const diminta = search.get("eventSlug");
  if (diminta && diminta !== slug) return { kind: "tolak" };

  // Halaman lama di luar /e/ (/daftar, /rundown, /vote ...) membaca slug dari
  // `?eventSlug=`; tanpa itu mereka jatuh ke "satu-satunya acara aktif".
  const halamanLuar = !pathAcara.startsWith("/e/") && !pathAcara.startsWith("/api/") && !pathAcara.startsWith("/_next/");
  return { kind: "layani", pathname: pathAcara, addSlugQuery: halamanLuar && !diminta };
}

/**
 * Di host Tally: alihkan halaman acara ke domain klien yang AKTIF. Hanya
 * halaman (bukan /api), hanya GET/HEAD, dan tidak untuk pratinjau admin di
 * iframe (Halaman acara, Formulir) supaya editor tetap memakai sesi Tally.
 */
export function redirectToClient(input: {
  pathname: string;
  search: string;
  method: string;
  fetchDest: string | null;
  domainFor: (slug: string) => { domain: string; status: StatusPeta } | undefined;
}): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (input.fetchDest === "iframe") return null;
  const cocok = /^\/e\/([^/]+)(\/.*)?$/.exec(input.pathname);
  if (!cocok) return null;
  if ((cocok[2] ?? "").startsWith("/api/")) return null;
  const tujuan = input.domainFor(decodeURIComponent(cocok[1]));
  if (tujuan?.status !== "aktif") return null;
  return `https://${tujuan.domain}${input.pathname}${input.search}`;
}
