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
 * Dua langkah. prepareWalkinLink memutuskan dan membuat tokennya selama
 * permintaan (beberapa kueri cepat), lalu `kirim` dijalankan pemanggil di
 * `after()`: meja tidak pernah menunggu penyedia email. Keduanya tidak
 * melempar; check-in sudah tersimpan sebelum ini dipanggil.
 */
export type WalkinLinkSkip =
  | "off"
  | "no_email"
  | "email_not_configured"
  | "not_eligible"
  | "has_account"
  | "email_taken"
  | "already_sent";

export type WalkinLinkResult =
  | { state: "queued"; email: string }
  | { state: "skipped"; reason: WalkinLinkSkip }
  | { state: "failed" };

/** `%` dan `_` di email dicari apa adanya, bukan sebagai wildcard ilike. */
function polaPersis(teks: string) {
  return teks.replace(/[\\%_]/g, (huruf) => `\\${huruf}`);
}

export async function prepareWalkinLink(
  event: Pick<EventRow, "id" | "slug" | "name" | "landing_config">,
  input: { participantId: string; email: string | null; name: string; request: Request },
): Promise<{ result: WalkinLinkResult; kirim?: () => Promise<void> }> {
  const member = memberConfig(event);
  if (!member?.enabled || !member.walkin_link) return { result: { state: "skipped", reason: "off" } };
  const email = input.email ? normalizeEmail(input.email) : "";
  if (!email) return { result: { state: "skipped", reason: "no_email" } };
  if (!isEmailConfigured()) return { result: { state: "skipped", reason: "email_not_configured" } };

  try {
    const client = getSupabaseServiceClient();
    if (!(await eligible(event.id, input.participantId, member))) return { result: { state: "skipped", reason: "not_eligible" } };

    // Email yang sudah punya akun, atau sudah dipakai peserta lain di acara
    // ini, tidak diberi tautan. Akun yang dibuat dari tautan ini menempel di
    // baris walk-in, jadi pemilik email yang asli tidak akan pernah bisa punya
    // akun, dan email yang salah ketik menyerahkan tiket walk-in ke orang lain.
    const [akun, lain, token] = await Promise.all([
      client.from("participant_accounts").select("id").eq("event_id", event.id).eq("email", email).limit(1),
      client
        .from("participants")
        .select("id,email")
        .eq("event_id", event.id)
        .is("source_removed_at", null)
        .neq("id", input.participantId)
        .ilike("email", polaPersis(email))
        .limit(20),
      client.from("participant_account_tokens").select("id").eq("event_id", event.id).eq("participant_id", input.participantId).eq("purpose", "undangan").limit(1),
    ]);
    if (akun.error || lain.error || token.error) return { result: { state: "failed" } };
    if ((akun.data ?? []).length > 0) return { result: { state: "skipped", reason: "has_account" } };
    if (((lain.data ?? []) as { email: string | null }[]).some((p) => normalizeEmail(p.email ?? "") === email)) {
      return { result: { state: "skipped", reason: "email_taken" } };
    }
    if ((token.data ?? []).length > 0) return { result: { state: "skipped", reason: "already_sent" } };

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
    if (error) return { result: { state: "failed" } };

    const lang = landingDefaultLang((event.landing_config ?? {}) as EventLandingConfig);
    const versi = versiBahasa(event, lang, memberLinkUrl(asal, event.slug, "undangan", rahasia));
    const kirim = async () => {
      try {
        const hasil = await sendMemberLink({
          eventId: event.id,
          kind: "walkin",
          to: email,
          name: input.name,
          eventName: versi.eventName,
          url: versi.url,
          lang: versi.lang,
        });
        if (hasil.state !== "sent") console.error("[walk-in] sign-in link not sent:", hasil.state === "failed" ? hasil.error : hasil.state);
      } catch (galat) {
        console.error("[walk-in] sign-in link not sent:", galat instanceof Error ? galat.message : galat);
      }
    };
    return { result: { state: "queued", email }, kirim };
  } catch (galat) {
    console.error("[walk-in] sign-in link not prepared:", galat instanceof Error ? galat.message : galat);
    return { result: { state: "failed" } };
  }
}
