import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { canScanAttendance, roleRedirects } from "@/lib/auth/roles";
import PosterQrCheckpoint from "./poster-client";

/**
 * Poster A4 QR checkpoint tetap: `/e/<slug>/checkpoint-qr/cetak?s=<sesi>`
 * (migrasi 202611020001). Dibuka dari Check-in > Checkpoints > Print poster.
 * Kodenya diambil dari API yang sama dengan layar QR (hanya akun panitia acara
 * ini), jadi peserta tidak bisa membuka halaman ini.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Checkpoint poster — Tally" };

export default async function PosterQrCheckpointPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canScanAttendance(user)) redirect(roleRedirects[user.role]);
  const raw = (await searchParams).s;
  const sesi = Number(Array.isArray(raw) ? raw[0] : raw);
  return <PosterQrCheckpoint sesiId={Number.isSafeInteger(sesi) && sesi > 0 ? sesi : null} />;
}
