import { z } from "zod";
import { activateWithCode, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/member/account";
import { memberError, outcomeResponse, requireMemberEvent } from "@/lib/member/api";

/**
 * Membuat kata sandi, atau menggantinya bila lupa, dengan email pendaftaran +
 * kode peserta. Berhasil = langsung masuk.
 */
const schema = z.object({
  email: z.string().trim().max(160).email(),
  code: z.string().trim().min(3).max(64),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function POST(request: Request) {
  const resolved = await requireMemberEvent(request);
  if (resolved.response) return resolved.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const pendek = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return memberError(
      "VALIDATION_ERROR",
      400,
      pendek
        ? `Kata sandi ${PASSWORD_MIN} sampai ${PASSWORD_MAX} karakter.`
        : "Isi email pendaftaran, kode peserta, dan kata sandi baru.",
    );
  }

  const outcome = await activateWithCode(resolved.event, resolved.member, parsed.data);
  return outcomeResponse(
    outcome,
    "Email dan kode peserta tidak cocok dengan data pendaftaran. Kode ada di email konfirmasi atau undangan Anda.",
  );
}
