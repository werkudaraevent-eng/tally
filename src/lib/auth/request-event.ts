import type { UserRole } from "./roles";
import { getEventBySlugPublic, listActiveEvents, requireEventScope } from "./event-scope";

/**
 * Slug event dari sebuah permintaan.
 *
 * DUA sumber, dan keduanya wajib ada -- ini bukan kelebihan, melainkan hasil
 * pengukuran:
 *
 * `src/proxy.ts` me-rewrite `/e/<slug>/api/...` menjadi
 * `/api/...?eventSlug=<slug>`, dan rewrite-nya MEMANG terjadi (diverifikasi
 * lewat header penanda: `rewrite:/api/leaderboard`). Tetapi `request.url` yang
 * diterima route handler tetap URL ASLI berikut prefiks `/e/<slug>`, sehingga
 * `eventSlug` yang ditambahkan proxy tidak pernah terbaca. Query yang ditulis
 * pemanggil sendiri (`?limit=999`) sampai dengan utuh -- jadi yang hilang
 * spesifik parameter yang DITAMBAHKAN saat rewrite.
 *
 * Ini persis kegagalan yang dulu membuat `rewrites()` di next.config ditinggalkan;
 * ternyata penyebabnya bukan mekanismenya, melainkan sifat rewrite itu sendiri.
 *
 * Akibatnya kalau hanya membaca query: seluruh URL `/e/<slug>/api/...` jatuh ke
 * jalur "tanpa slug", yang hanya aman bila tepat satu event aktif. Dengan dua
 * event aktif SEMUA endpoint publik membalas 404 -- termasuk yang slug-nya sudah
 * ditulis eksplisit di URL.
 */
export function eventSlugFromRequest(request: Request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("eventSlug");
  if (fromQuery) return fromQuery;

  const fromPath = url.pathname.match(/^\/e\/([^/]+)\//);
  return fromPath ? decodeURIComponent(fromPath[1]) : undefined;
}

export async function requireRequestEvent(request: Request, roles?: UserRole[]) {
  const explicit = eventSlugFromRequest(request);
  if (explicit) return requireEventScope(explicit, roles);

  // Kompatibilitas link lama: hanya aman kalau tepat satu event aktif. Dengan
  // dua event aktif, memilih "yang terbaru" dapat menyimpan order ke event
  // salah tanpa galat; kondisi ambigu harus meminta pemilihan eksplisit.
  const active = await listActiveEvents();
  return requireEventScope(active.length === 1 ? active[0].slug : undefined, roles);
}

export async function getPublicRequestEvent(request: Request) {
  const slug = eventSlugFromRequest(request);
  if (slug) return getEventBySlugPublic(slug);
  const active = await listActiveEvents();
  return active.length === 1 ? active[0] : null;
}

/**
 * Versi untuk SERVER COMPONENT (halaman), bukan route handler.
 *
 * Halaman tidak menerima `Request`; ia menerima `searchParams`. Slug sampai ke
 * sana karena `src/proxy.ts` me-rewrite `/e/<slug>/display` menjadi
 * `/display?eventSlug=<slug>`.
 *
 * Aturan fallback-nya SAMA dengan getPublicRequestEvent: tanpa slug hanya aman
 * bila tepat satu event aktif. Dengan dua event aktif, menebak berarti
 * menayangkan data event yang salah di proyektor.
 */
export async function getPublicPageEvent(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
) {
  const params = searchParams ? await searchParams : undefined;
  const raw = params?.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (slug) return getEventBySlugPublic(slug);
  const active = await listActiveEvents();
  return active.length === 1 ? active[0] : null;
}