import { getCurrentUser } from "./login";
import type { CurrentUser, UserRole } from "./roles";

export async function requireUser(roles?: UserRole[]) {
  const user = await getCurrentUser();
  if (!user) return { user: null as null, response: Response.json({ error: { code: "UNAUTHENTICATED", message: "Sesi login tidak ditemukan." } }, { status: 401 }) };
  // `super_admin` mewarisi seluruh kewenangan `admin`, jadi guard yang meminta
  // "admin" ikut menerimanya. Ditangani di sini, bukan dengan menambahkan
  // "super_admin" di 36 pemanggilan requireUser — satu saja terlewat dan pemilik
  // sistem terkunci dari halamannya sendiri.
  //
  // Kewenangan yang HANYA milik super_admin dibatasi eksplisit dengan
  // requireUser(["super_admin"]), bukan mengandalkan pelebaran ini.
  const satisfied = !roles
    || roles.includes(user.role)
    || (user.role === "super_admin" && roles.includes("admin"));
  if (!satisfied) return { user: null as null, response: Response.json({ error: { code: "FORBIDDEN", message: "Anda tidak punya izin untuk aksi ini." } }, { status: 403 }) };
  return { user, response: null } as { user: CurrentUser; response: null };
}

export function forbiddenResponse() {
  return Response.json({ error: { code: "FORBIDDEN", message: "Anda tidak punya izin untuk aksi ini." } }, { status: 403 });
}
