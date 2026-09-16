import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { isAdminLevel } from "@/lib/auth/roles";
import { AdminShell } from "@/components/admin/admin-shell";
import { NAMA_COOKIE_PIN, PIN_BAWAAN } from "@/components/admin/sidebar-store";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // isAdminLevel, bukan role === "admin": perbandingan persis akan mengusir
  // super_admin dari workspace-nya sendiri.
  if (!isAdminLevel(user)) redirect(user.role === "booth" ? "/booth" : "/cashier");

  // Sematan rel dibaca DI SERVER, dari cookie, bukan dari localStorage setelah
  // hidrasi. Ia menentukan lebar kolom konten: dibaca belakangan, setiap
  // pemuatan halaman dimulai dengan lebar yang salah lalu melompat 196px, tepat
  // ketika orang mulai membaca.
  const cookie = (await cookies()).get(NAMA_COOKIE_PIN)?.value;
  const pinAwal = cookie === undefined ? PIN_BAWAAN : cookie === "1";
  return <AdminShell pinAwal={pinAwal}>{children}</AdminShell>;
}
