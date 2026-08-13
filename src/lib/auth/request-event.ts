import type { UserRole } from "./roles";
import { getEventBySlugPublic, listActiveEvents, requireEventScope } from "./event-scope";
import { eventSlugFromRequest } from "./event-slug";

export { eventSlugFromRequest };

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