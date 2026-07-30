import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { isAdminLevel } from "@/lib/auth/roles";

export default async function BoothLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "booth" && !isAdminLevel(user)) redirect(user.role === "cashier" ? "/cashier" : "/login");
  return <>{children}</>;
}
