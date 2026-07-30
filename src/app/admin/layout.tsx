import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { isAdminLevel } from "@/lib/auth/roles";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // isAdminLevel, bukan role === "admin": perbandingan persis akan mengusir
  // super_admin dari workspace-nya sendiri.
  if (!isAdminLevel(user)) redirect(user.role === "booth" ? "/booth" : "/cashier");
  return <AdminShell>{children}</AdminShell>;
}
