import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { memberConfig } from "@/lib/member/account";
import { confirmEmail } from "@/lib/member/links";

/**
 * Tautan "Konfirmasi email" dari email pendaftaran. GET karena dibuka dari
 * klien email; hasilnya hanya menandai email terbukti, tidak memberi sesi.
 * Selalu berakhir di area peserta, dengan tanda berhasil atau tidak.
 */
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  const asal = new URL(request.url).origin;
  if (!event || !memberConfig(event)) return Response.redirect(new URL("/", asal), 303);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = await confirmEmail(event, token);
  return Response.redirect(new URL(`/e/${encodeURIComponent(event.slug)}/peserta?konfirmasi=${ok ? "ok" : "gagal"}`, asal), 303);
}
