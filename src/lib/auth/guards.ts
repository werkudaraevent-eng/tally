import { getCurrentUser } from "./login";
import type { CurrentUser, UserRole } from "./roles";

export async function requireUser(roles?: UserRole[]) {
  const user = await getCurrentUser();
  if (!user) return { user: null as null, response: Response.json({ error: { code: "UNAUTHENTICATED", message: "Sesi login tidak ditemukan." } }, { status: 401 }) };
  if (roles && !roles.includes(user.role)) return { user: null as null, response: Response.json({ error: { code: "FORBIDDEN", message: "Anda tidak punya izin untuk aksi ini." } }, { status: 403 }) };
  return { user, response: null } as { user: CurrentUser; response: null };
}

export function forbiddenResponse() {
  return Response.json({ error: { code: "FORBIDDEN", message: "Anda tidak punya izin untuk aksi ini." } }, { status: 403 });
}
