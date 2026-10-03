import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/member/account";
import { setPasswordWithToken } from "@/lib/member/links";
import { memberError, outcomeResponse, requireMemberEvent } from "@/lib/member/api";

/** Membuat atau mengganti kata sandi dengan tautan dari email. Berhasil = langsung masuk. */
const schema = z.object({
  token: z.string().trim().min(20).max(100),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const pendek = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return memberError("VALIDATION_ERROR", 400, pendek ? `Kata sandi ${PASSWORD_MIN} sampai ${PASSWORD_MAX} karakter.` : "Tautan tidak lengkap. Minta tautan baru.");
  }
  const outcome = await setPasswordWithToken(resolved.event, resolved.member, parsed.data);
  return outcomeResponse(outcome, "Tautan ini sudah dipakai atau kedaluwarsa. Minta tautan baru lewat \"Lupa kata sandi?\".");
}
