import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { isAdminLevel } from "@/lib/auth/roles";

export default async function CashierLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "cashier" && !isAdminLevel(user)) redirect(user.role === "booth" ? "/booth" : "/login");
  return <>{children}</>;
}
