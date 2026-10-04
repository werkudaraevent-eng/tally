import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { canScanAttendance, roleRedirects } from "@/lib/auth/roles";
import StasiunClient from "./stasiun-client";

/**
 * Stasiun cetak: `/e/<slug>/stasiun`, dibuka di laptop meja registrasi yang
 * tersambung ke printer. Akun pemindai cukup; satu akun pemindai khusus per
 * stasiun, supaya keluar dari HP petugas tidak ikut menghentikan stasiun.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Print station — Tally" };

export default async function StasiunPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canScanAttendance(user)) redirect(roleRedirects[user.role]);

  return <StasiunClient />;
}
