import { getCurrentUser, logout, revokeUserSessions } from "@/lib/auth/login";

/**
 * Keluar. Body `{ "all": true }` juga mencabut sesi akun ini di semua perangkat
 * lain (OWASP ASVS V3.3.4), mis. setelah laptop panitia hilang.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { all?: unknown } | null;
  if (body?.all === true) {
    const user = await getCurrentUser();
    if (user) await revokeUserSessions(user.id);
  }
  await logout();
  return Response.json({ ok: true });
}
