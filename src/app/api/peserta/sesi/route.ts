import { getMemberSession, segarkanCookieSesi } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";

/**
 * Portal terbuka: sesi diperpanjang (getMemberSession) dan cookie-nya ditulis
 * ulang dengan umur penuh, supaya peserta tetap masuk sampai acara selesai.
 */
export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const sesi = await getMemberSession(resolved.event);
  if (!sesi) return memberError("UNAUTHORIZED", 401, "Masuk dulu ke Dashboard saya.");
  await segarkanCookieSesi();
  return Response.json({ ok: true });
}
