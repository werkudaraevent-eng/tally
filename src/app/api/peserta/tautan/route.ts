import { z } from "zod";
import { requestPasswordLink } from "@/lib/member/links";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { linkOrigin } from "@/lib/domain-klien/asal";

/**
 * "Kirim tautan ke email": tautan sekali pakai untuk membuat atau mengganti
 * kata sandi. Jawaban berhasil sama untuk email terdaftar maupun tidak.
 */
const schema = z.object({ email: z.string().trim().max(160).email(), lang: z.enum(["id", "en"]).optional() });

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Isi email pendaftaran Anda.");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip");
  const hasil = await requestPasswordLink(resolved.event, resolved.member, { email: parsed.data.email, ip, requestUrl: await linkOrigin(request, resolved.event.id), lang: parsed.data.lang });
  switch (hasil.status) {
    case "sent":
      return Response.json({ ok: true });
    case "not_configured":
      return memberError("EMAIL_NOT_CONFIGURED", 503, "Pengiriman email belum aktif untuk acara ini. Hubungi panitia.");
    default:
      return memberError("EMAIL_FAILED", 502, "Email belum terkirim. Coba lagi sebentar lagi.");
  }
}
