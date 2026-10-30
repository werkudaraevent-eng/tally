import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { canOpenAdminWorkspace } from "@/lib/auth/roles";
import { muatPeranKustom } from "@/lib/auth/izin-server";
import { AdminShell } from "@/components/admin/admin-shell";
import { NAMA_COOKIE_PIN, PIN_BAWAAN } from "@/components/admin/sidebar-store";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Bukan role === "admin": perbandingan persis akan mengusir super_admin dari
  // workspace-nya sendiri. Akun kustom ikut masuk; halaman di luar modulnya
  // dialihkan AdminShell dan datanya ditolak API (izin-modul.ts).
  if (!canOpenAdminWorkspace(user)) redirect(user.role === "booth" ? "/booth" : user.role === "viewer" ? "/events" : "/cashier");

  // Sematan rel dibaca DI SERVER, dari cookie, bukan dari localStorage setelah
  // hidrasi. Ia menentukan lebar kolom konten: dibaca belakangan, setiap
  // pemuatan halaman dimulai dengan lebar yang salah lalu melompat 196px, tepat
  // ketika orang mulai membaca.
  // Izin peran kustom dibaca DI SERVER dan ikut di HTML pertama: sidebar dan
  // pengalihan dari halaman terlarang tidak menunggu satu putaran /api/auth/me.
  const peranKustom = user.role === "custom" ? await muatPeranKustom(user) : null;
  if (user.role === "custom" && !peranKustom) redirect("/events");

  const cookie = (await cookies()).get(NAMA_COOKIE_PIN)?.value;
  const pinAwal = cookie === undefined ? PIN_BAWAAN : cookie === "1";
  return (
    <AdminShell pinAwal={pinAwal} pinTersimpan={cookie !== undefined} peranKustom={peranKustom ? { name: peranKustom.name, izin: peranKustom.izin } : null}>
      {children}
    </AdminShell>
  );
}
