import { randomBytes } from "node:crypto";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { isEmailConfigured } from "@/lib/email/client";
import { sendMemberLink } from "@/lib/email/member-links";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { eligible, hashToken, memberConfig, normalizeEmail } from "./account";
import { MASA_UNDANGAN_MS, memberLinkUrl, versiBahasa } from "./links";

/**
 * Email Sign-in link untuk walk-in yang baru didaftarkan petugas di meja
 * (Participant area > "Email a sign-in link to walk-ins", bawaan MATI).
 *
 * Tautannya token `undangan` tanpa blast: halaman buat kata sandi yang sama
 * dengan blast Sign-in link, berlaku 7 hari, sekali pakai. Hanya peserta yang
 * baru saja dibuat (status `created`), jadi menyalakan sakelar tidak mengirim
 * apa pun ke peserta lama.
 *
 * Tidak pernah melempar: check-in sudah tersimpan sebelum ini dipanggil, dan
 * meja hanya membaca `state` untuk satu baris keterangan.
 */
export type WalkinLinkResult =
  | { state: "sent"; email: string }
  | { state: "skipped"; reason: "off" | "no_email" | "not_eligible" | "has_account" | "already_sent" | "email_not_configured" }
  | { state: "failed" };

export async function sendWalkinLink(
  event: Pick<EventRow, "id" | "slug" | "name" | "landing_config">,
  input: { participantId: string; email: string | null; name: string; request: Request },
): Promise<WalkinLinkResult> {
  const member = memberConfig(event);
  if (!member?.enabled || !member.walkin_link) return { state: "skipped", reason: "off" };
  const email = input.email ? normalizeEmail(input.email) : "";
  if (!email) return { state: "skipped", reason: "no_email" };
  if (!isEmailConfigured()) return { state: "skipped", reason: "email_not_configured" };

  try {
    const client = getSupabaseServiceClient();
    if (!(await eligible(event.id, input.participantId, member))) return { state: "skipped", reason: "not_eligible" };

    // Email yang sudah punya akun di acara ini tidak diberi tautan buat kata
    // sandi baru: tautan itu sama dengan reset, dan petugas bisa salah ketik
    // email orang lain. Pemiliknya masuk dengan kata sandinya sendiri.
    const [akun, token] = await Promise.all([
      client.from("participant_accounts").select("id").eq("event_id", event.id).eq("email", email).limit(1),
      client.from("participant_account_tokens").select("id").eq("event_id", event.id).eq("participant_id", input.participantId).eq("purpose", "undangan").limit(1),
    ]);
    if (akun.error || token.error) return { state: "failed" };
    if ((akun.data ?? []).length > 0) return { state: "skipped", reason: "has_account" };
    if ((token.data ?? []).length > 0) return { state: "skipped", reason: "already_sent" };

    const asal = await linkOrigin(input.request, event.id);
    const rahasia = randomBytes(32).toString("base64url");
    const { error } = await client.from("participant_account_tokens").insert({
      event_id: event.id,
      purpose: "undangan",
      token_hash: hashToken(rahasia),
      email,
      account_id: null,
      participant_id: input.participantId,
      registration_id: null,
      expires_at: new Date(Date.now() + MASA_UNDANGAN_MS).toISOString(),
    } as never);
    if (error) return { state: "failed" };

    const lang = landingDefaultLang((event.landing_config ?? {}) as EventLandingConfig);
    const versi = versiBahasa(event, lang, memberLinkUrl(asal, event.slug, "undangan", rahasia));
    const hasil = await sendMemberLink({
      eventId: event.id,
      kind: "walkin",
      to: email,
      name: input.name,
      eventName: versi.eventName,
      url: versi.url,
      lang: versi.lang,
    });
    if (hasil.state === "sent") return { state: "sent", email };
    if (hasil.state === "failed") console.error("[walk-in] sign-in link not sent:", hasil.error);
    return { state: "failed" };
  } catch (error) {
    console.error("[walk-in] sign-in link not sent:", error instanceof Error ? error.message : error);
    return { state: "failed" };
  }
}
