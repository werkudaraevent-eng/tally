import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(user.role === "booth" ? "/booth" : "/cashier");
  return <AdminShell>{children}</AdminShell>;
}
