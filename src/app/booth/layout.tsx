import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";

export default async function BoothLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "booth" && user.role !== "admin") redirect(user.role === "cashier" ? "/cashier" : "/login");
  return <>{children}</>;
}
