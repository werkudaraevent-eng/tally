import { getCurrentUser } from "@/lib/auth/login";
import { UsersWorkspace } from "./users-workspace";

/**
 * Users & roles, tingkat workspace. Akses dijaga layout di sebelahnya;
 * kewenangan di dalamnya dijaga /api/admin/users (admin hanya melihat dan
 * mereset PIN operator booth & kasir). Alamat lama `/admin/users` dan varian
 * ber-slug dialihkan 308 ke sini oleh src/proxy.ts.
 */
export default async function UsersPage() {
  const user = await getCurrentUser();
  return <UsersWorkspace username={user?.username ?? null} role={user?.role ?? null} />;
}
