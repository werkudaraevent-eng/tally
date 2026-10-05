import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { isAdminLevel, roleRedirects } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Users & roles" };

/**
 * Gerbang server untuk /users. Halaman ini di luar /admin, jadi gerbang layout
 * admin tidak berlaku di sini dan harus ditulis ulang: tanpa ini kasir dan
 * pengunjung yang belum masuk tetap menerima kerangka halamannya (datanya tetap
 * dijaga /api/admin/users, tetapi halaman yang menolak setelah dimuat bukan
 * gerbang).
 */
export default async function UsersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminLevel(user)) redirect(roleRedirects[user.role]);
  return children;
}
