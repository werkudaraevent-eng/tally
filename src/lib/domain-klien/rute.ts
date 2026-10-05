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
const DILARANG = [/^\/admin(\/|$)/, /^\/login(\/|$)/, /^\/booth(\/|$)/, /^\/cashier(\/|$)/, /^\/scan(\/|$)/, /^\/stasiun(\/|$)/, /^\/cetak-badge(\/|$)/, /^\/api\/(admin|cron|auth|settings|webhooks)(\/|$)/];

/** API publik dan peserta, langsung atau lewat /e/<slug>/api. */
const API = /^\/(e\/[^/]+\/)?api(\/|$)/;

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

  // Juga lewat /e/<slug>/...: proxy menulis ulang /e/<slug>/admin ke /admin.
  const sisa = pathname.replace(/^\/e\/[^/]+/, "") || "/";
  if (DILARANG.some((pola) => pola.test(pathname) || pola.test(sisa))) return { kind: "tolak" };
  const lain = /^\/e\/([^/]+)/.exec(pathname);
  if (lain && decodeURIComponent(lain[1]) !== slug) return { kind: "tolak" };
  const diminta = search.get("eventSlug");
  if (diminta && diminta !== slug) return { kind: "tolak" };

  // Dilepas: halaman pindah ke alamat Tally dengan path dan query yang sama
  // (temuan QA M2). API tetap dilayani di sini, tanpa pengalihan: tautan
  // berhenti berlangganan di email lama (GET dan POST one-click) harus tetap
  // bekerja, dan klien email tidak mengikuti pengalihan untuk POST.
  if (status === "dilepas" && !API.test(pathAcara)) {
    if (!tallyOrigin) return { kind: "tolak" };
    const query = search.toString();
    // Tautan pendek di luar /e/ (/daftar, /rundown) dibawa ke /e/<slug>/...,
    // karena di host Tally path itu tidak tahu acaranya (temuan QA L7).
    const tujuan = pathAcara.startsWith("/e/") || pathAcara.startsWith("/_next/") ? pathAcara : `/e/${slugAman}${pathAcara}`;
    return { kind: "alihkan", to: `${tallyOrigin}${tujuan}${query ? `?${query}` : ""}` };
  }

  // Halaman lama di luar /e/ (/daftar, /rundown, /vote ...) membaca slug dari
  // `?eventSlug=`; tanpa itu mereka jatuh ke "satu-satunya acara aktif".
  const halamanLuar = !pathAcara.startsWith("/e/") && !pathAcara.startsWith("/api/") && !pathAcara.startsWith("/_next/");
  return { kind: "layani", pathname: pathAcara, addSlugQuery: halamanLuar && !diminta };
}

/**
 * Halaman PESERTA di bawah /e/<slug> yang dipindah ke domain klien: halaman
 * acara (dan versi bahasanya), formulir pendaftaran, masuk, area peserta,
 * rundown, denah, kode pendaftaran. Daftar izin, bukan daftar larangan (temuan
 * QA H1): ruang kerja panitia (/admin, /booth, /cashier, /scan, /display,
 * /undian, /workspace, /pratinjau) juga tinggal di bawah /e/<slug>, dan host
 * klien menolaknya, jadi mengalihkannya berarti 404 untuk panitia.
 */
const HALAMAN_PESERTA = [/^(\/(en|id))?(\/daftar)?\/?$/, /^\/(masuk|peserta|rundown|denah)(\/.*)?$/, /^(\/(en|id))?\/(peserta|kode\/[^/]+)\/?$/];

/**
 * Di host Tally: alihkan halaman peserta ke domain klien yang AKTIF. Hanya
 * GET/HEAD, dan tidak untuk pratinjau admin di iframe (Halaman acara,
 * Formulir) supaya editor tetap memakai sesi Tally.
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
  if (!HALAMAN_PESERTA.some((pola) => pola.test(cocok[2] ?? ""))) return null;
  const tujuan = input.domainFor(decodeURIComponent(cocok[1]));
  if (tujuan?.status !== "aktif") return null;
  return `https://${tujuan.domain}${input.pathname}${input.search}`;
}
