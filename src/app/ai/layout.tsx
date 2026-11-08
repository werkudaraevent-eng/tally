import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { roleRedirects } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "AI" };

/**
 * Gerbang server untuk /ai: pemilik (super admin) saja. Halaman ini di luar
 * /admin, jadi gerbang layout admin tidak berlaku (sama dengan /users). Admin
 * acara diarahkan ke /events: tombol AI di modulnya tetap bekerja, yang
 * diatur di sini hanya kunci, model, dan batas biaya untuk seluruh Tally.
 */
export default async function AiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") redirect(user.role === "admin" ? "/events" : roleRedirects[user.role]);
  return children;
}
