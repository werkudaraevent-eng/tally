import { z } from "zod";
import { apiError } from "@/lib/api";
import { loginWithPin } from "@/lib/auth/login";

const schema = z.object({ username: z.string().trim().min(1).max(100), pin: z.string().regex(/^\d{6}$/), remember_me: z.boolean().optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const outcome = await loginWithPin(parsed.data.username, parsed.data.pin, parsed.data.remember_me ?? false);

  if (outcome.status === "rate_limited") {
    // 429 dengan header Retry-After, bukan 401. Kalau dikembalikan 401, layar login
    // menampilkan "Username atau PIN salah" dan operator akan mencoba PIN lain
    // padahal PIN-nya mungkin sudah benar sejak percobaan pertama — mereka akan
    // menghabiskan seluruh masa kuncian dengan menebak-nebak.
    //
    // Lama tunggu dikirim dua kali: `Retry-After` untuk perantara HTTP, dan di
    // dalam body untuk layar login yang perlu menampilkannya ke manusia.
    const seconds = outcome.retryAfterSeconds;
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `Terlalu banyak percobaan login untuk username ini. Tunggu ${seconds} detik, lalu coba lagi.`,
          details: { retry_after_seconds: seconds },
        },
      },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  if (outcome.status === "invalid") return apiError("UNAUTHENTICATED", 401);
  return Response.json({ user: outcome.user });
}
