import { z } from "zod";
import { apiError } from "@/lib/api";
import { jawabGagal } from "@/lib/auth/jawab";
import { loginStaff } from "@/lib/auth/login";
import { SANDI_MAX } from "@/lib/auth/kredensial";
import { ipKlien } from "@/lib/ip-klien";

// `secret` = PIN (akun perangkat) atau kata sandi (admin). `pin` tetap diterima
// supaya tab login lama yang terbuka saat deploy masih bisa masuk.
const schema = z.object({
  username: z.string().trim().min(1).max(100),
  secret: z.string().min(1).max(SANDI_MAX).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  remember_me: z.boolean().optional(),
}).refine((isi) => isi.secret !== undefined || isi.pin !== undefined);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const rahasia = parsed.data.secret ?? parsed.data.pin ?? "";
  const outcome = await loginStaff(parsed.data.username, rahasia, parsed.data.remember_me ?? false, ipKlien(request.headers));

  if (outcome.status === "rate_limited" || outcome.status === "invalid") return jawabGagal(outcome, "Wrong username, PIN or password.");
  if (outcome.status === "next") return Response.json({ next: outcome.tahap });
  return Response.json({ user: outcome.user });
}
