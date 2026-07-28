import { logout } from "@/lib/auth/login";

export async function POST() {
  await logout();
  return Response.json({ ok: true });
}
