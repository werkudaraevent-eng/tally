import type { UserRole } from "./roles";
import { getEventBySlugPublic, listActiveEvents, requireEventScope } from "./event-scope";

export function eventSlugFromRequest(request: Request) {
  return new URL(request.url).searchParams.get("eventSlug") ?? undefined;
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