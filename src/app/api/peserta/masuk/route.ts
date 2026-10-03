import { z } from "zod";
import { loginMember, PASSWORD_MAX } from "@/lib/member/account";
import { memberError, outcomeResponse, requireMemberEvent } from "@/lib/member/api";

/** Masuk area peserta dengan email + kata sandi. */
const schema = z.object({
  email: z.string().trim().max(160).email(),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Isi email dan kata sandi.");

  const outcome = await loginMember(resolved.event, resolved.member, parsed.data);
  return outcomeResponse(
    outcome,
    "Email atau kata sandi tidak cocok. Periksa lagi, atau pilih \"Lupa kata sandi?\" untuk menerima tautan di email.",
  );
}
