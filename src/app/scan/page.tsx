import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { canScanAttendance } from "@/lib/auth/roles";
import { roleRedirects } from "@/lib/auth/roles";
import ScanClient from "./scan-client";

/**
 * Layar pemindai kehadiran.
 *
 * Penjagaan di server, bukan di klien: halaman ini dibuka dari ponsel yang
 * dipegang bergantian di pintu masuk, dan penjagaan yang hanya menyembunyikan
 * tombol tetap menyisakan alamatnya untuk siapa pun yang pernah melihatnya.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Pemindai kehadiran — Tally" };

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canScanAttendance(user)) redirect(roleRedirects[user.role]);

  return <ScanClient />;
}
