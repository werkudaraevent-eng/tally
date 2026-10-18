import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { canScanAttendance, roleRedirects } from "@/lib/auth/roles";
import LayarQrCheckpoint from "./layar-client";

/**
 * Layar QR checkpoint: `/e/<slug>/checkpoint-qr?s=<sesi>`, dibuka di TV,
 * tablet, atau laptop di lokasi checkpoint (scan mandiri). Akun pemindai
 * cukup; kodenya hanya diberikan ke akun panitia acara ini (API
 * /api/attendance/checkpoint-qr), jadi peserta tidak bisa membuka layar ini
 * untuk menyelesaikan checkpoint dari rumah.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Checkpoint QR — Tally" };

export default async function CheckpointQrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canScanAttendance(user)) redirect(roleRedirects[user.role]);
  const raw = (await searchParams).s;
  const sesi = Number(Array.isArray(raw) ? raw[0] : raw);
  return <LayarQrCheckpoint sesiId={Number.isSafeInteger(sesi) && sesi > 0 ? sesi : null} />;
}
