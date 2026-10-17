import { z } from "zod";
import { memberError, outcomeResponse, requireMemberEvent } from "@/lib/member/api";
import { caraMasuk, masukDenganKode } from "@/lib/member/masuk-lain";

/** Masuk dengan kode 6 digit dari email (cara masuk Email code). */
const schema = z.object({
  email: z.string().trim().max(160).email(),
  kode: z.string().trim().transform((nilai) => nilai.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/)),
});

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  if (caraMasuk(resolved.member) !== "email_code") return memberError("METHOD_OFF", 404, "Cara masuk ini tidak dipakai acara ini. Muat ulang halaman.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Ketik 6 angka dari email.");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip");
  const outcome = await masukDenganKode(resolved.event, resolved.member, { ...parsed.data, ip });
  return outcomeResponse(outcome, "Kode tidak cocok atau sudah kedaluwarsa. Periksa lagi, atau minta kode baru.");
}
