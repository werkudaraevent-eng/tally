import type { LoginOutcome } from "./login";

/** Jawaban untuk hasil yang dipakai bersama langkah pertama dan kode authenticator. */
export function jawabGagal(outcome: Extract<LoginOutcome, { status: "rate_limited" | "invalid" }>, pesanSalah: string) {
  if (outcome.status === "rate_limited") {
    // 429 + Retry-After, bukan 401: dengan 401 operator yang sedang terkunci
    // akan mencoba PIN lain padahal PIN-nya mungkin sudah benar.
    const seconds = outcome.retryAfterSeconds;
    return Response.json(
      { error: { code: "RATE_LIMITED", message: `Too many sign-in attempts from this device. Wait ${seconds} seconds, then try again.`, details: { retry_after_seconds: seconds } } },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }
  return Response.json({ error: { code: "UNAUTHENTICATED", message: pesanSalah } }, { status: 401 });
}
