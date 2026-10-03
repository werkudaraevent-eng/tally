import { getPublicRequestEvent } from "@/lib/auth/request-event";
import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import type { MemberOutcome } from "./account";
import { memberConfig } from "./account";

/** Galat area peserta. Pesannya ditulis untuk peserta, bukan untuk panitia. */
export function memberError(code: string, status: number, message: string, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status });
}

/**
 * Acara dari permintaan, hanya bila area pesertanya menyala dan acaranya tidak
 * diarsipkan. Acara yang SELESAI tetap boleh: peserta masih mungkin membuka
 * kodenya atau susunan acara setelah hari-H.
 */
export async function requireMemberEvent(
  request: Request,
): Promise<{ event: EventRow; member: LandingMemberConfig; response: null } | { event: null; member: null; response: Response }> {
  const event = await getPublicRequestEvent(request);
  if (!event || event.status === "archived") {
    return { event: null, member: null, response: memberError("NOT_FOUND", 404, "Acara tidak ditemukan.") };
  }
  const member = memberConfig(event);
  if (!member) {
    return { event: null, member: null, response: memberError("MEMBER_DISABLED", 404, "Area peserta tidak dibuka untuk acara ini.") };
  }
  return { event, member, response: null };
}

export function outcomeResponse(outcome: MemberOutcome, invalidMessage: string) {
  switch (outcome.status) {
    case "ok":
      return Response.json({ ok: true });
    case "rate_limited":
      return memberError(
        "RATE_LIMITED",
        429,
        `Terlalu banyak percobaan untuk email ini. Coba lagi dalam ${Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60))} menit.`,
        { retry_after_seconds: outcome.retryAfterSeconds },
      );
    case "not_eligible":
      return memberError(
        "NOT_ELIGIBLE",
        403,
        "Akun ini belum bisa masuk. Area peserta hanya untuk peserta yang terdaftar di acara ini. Hubungi panitia.",
      );
    case "conflict":
      return memberError(
        "EMAIL_IN_USE",
        409,
        "Email ini sudah punya akun di acara ini. Masuk dengan kata sandinya, atau pilih \"Lupa kata sandi?\".",
      );
    default:
      return memberError("INVALID", 401, invalidMessage);
  }
}
