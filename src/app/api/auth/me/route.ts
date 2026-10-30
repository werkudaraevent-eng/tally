import { getCurrentUser } from "@/lib/auth/login";
import { muatPeranKustom } from "@/lib/auth/izin-server";

export async function GET() {
  const user = await getCurrentUser();
  // Akun kustom ikut membawa izinnya: sidebar dan mode View membacanya dari sini.
  // Hanya penanda tampilan; setiap API tetap memeriksa sendiri.
  const peran = user ? await muatPeranKustom(user) : null;
  return Response.json({ user, custom_role: peran ? { name: peran.name, permissions: peran.izin } : null });
}
