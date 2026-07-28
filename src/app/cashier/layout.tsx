import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";

export default async function CashierLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "cashier" && user.role !== "admin") redirect(user.role === "booth" ? "/booth" : "/login");
  return <>{children}</>;
}
