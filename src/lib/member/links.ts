import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { isEmailConfigured } from "@/lib/email/client";
import { sendMemberLink } from "@/lib/email/member-links";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { clearGate, eligible, HASH_ROUNDS, hashToken, normalizeEmail, startSession } from "./account";

/**
 * Tautan sekali pakai dari email (tabel participant_account_tokens).
 *
 *   konfirmasi  membuktikan email akun yang dibuat dari formulir pendaftaran
 *   sandi       membuat atau mengganti kata sandi
 *   undangan    sama dengan `sandi`, tetapi dikirim panitia lewat Pesan peserta
 *               dan berlaku 7 hari (lihat createInviteToken)
 *
 * Tautan "sandi" menggantikan "buat kata sandi dengan kode peserta": peserta
 * impor panitia, pendaftar sebelum fitur ini, dan yang lupa kata sandi meminta
 * tautan ke emailnya. Membukanya membuktikan pemilik kotak masuk, jadi
 * `email_verified_at` ikut terisi.
 */

const MASA: Record<"konfirmasi" | "sandi", number> = { konfirmasi: 14 * 24 * 60 * 60 * 1000, sandi: 60 * 60 * 1000 };
/** Masa berlaku tautan undangan, dihitung dari saat kiriman berangkat. */
export const MASA_UNDANGAN_MS = 7 * 24 * 60 * 60 * 1000;
/** Paling banyak tiga permintaan per email per 15 menit: cukup untuk "belum masuk, kirim lagi", sempit untuk membanjiri kotak masuk orang. */
const BATAS_EMAIL = 3;
const JENDELA_EMAIL = 15 * 60 * 1000;
/**
 * Per IP: 20 per 10 menit. Lebih longgar dari batas login karena peserta impor
 * satu perusahaan sering meminta tautan dari satu jaringan kantor sekaligus,
 * dan yang tertahan di sini tidak diberi tahu (jawabannya tetap "terkirim").
 */
const BATAS_IP = 20;
const JENDELA_IP = 10 * 60 * 1000;

type Sasaran = { accountId?: string; participantId?: string; registrationId?: string };

async function buatToken(eventId: string, purpose: "konfirmasi" | "sandi", email: string, sasaran: Sasaran) {
  const token = randomBytes(32).toString("base64url");
  const { error } = await getSupabaseServiceClient()
    .from("participant_account_tokens")
    .insert({
      event_id: eventId,
      purpose,
      token_hash: hashToken(token),
      email,
      account_id: sasaran.accountId ?? null,
      participant_id: sasaran.participantId ?? null,
      registration_id: sasaran.registrationId ?? null,
      expires_at: new Date(Date.now() + MASA[purpose]).toISOString(),
    } as never);
  if (error) throw new Error("Tautan gagal dibuat.");
  return token;
}

/** Alamat tautan, dari origin permintaan (sama dengan registrationCodeUrl). */
export function memberLinkUrl(requestUrl: string, slug: string, purpose: "konfirmasi" | "sandi" | "undangan", token: string) {
  const origin = new URL(requestUrl).origin;
  const path = purpose === "konfirmasi"
    ? `/e/${encodeURIComponent(slug)}/api/peserta/konfirmasi?token=${token}`
    : `/e/${encodeURIComponent(slug)}/masuk?sandi=${token}`;
  return new URL(path, origin).toString();
}

/**
 * Tautan konfirmasi akun tanpa mengirim email: dipakai formulir pendaftaran
 * untuk menyelipkannya ke email konfirmasi pendaftaran, supaya pendaftar
 * menerima satu email, bukan dua. Null bila token gagal dibuat; pemanggil lalu
 * jatuh ke sendConfirmationLink.
 */
export async function confirmationLinkUrl(
  event: Pick<EventRow, "id" | "slug">,
  input: { accountId: string; email: string; requestUrl: string },
): Promise<string | null> {
  try {
    const token = await buatToken(event.id, "konfirmasi", normalizeEmail(input.email), { accountId: input.accountId });
    return memberLinkUrl(input.requestUrl, event.slug, "konfirmasi", token);
  } catch {
    return null;
  }
}

/** Email konfirmasi untuk akun yang baru dibuat dari formulir. Best effort. */
export async function sendConfirmationLink(
  event: Pick<EventRow, "id" | "slug" | "name" | "landing_config">,
  input: { accountId: string; email: string; name: string; requestUrl: string },
) {
  if (!isEmailConfigured()) return { state: "not_configured" as const };
  try {
    const token = await buatToken(event.id, "konfirmasi", normalizeEmail(input.email), { accountId: input.accountId });
    return await sendMemberLink({
      eventId: event.id,
      kind: "konfirmasi",
      to: input.email,
      name: input.name,
      eventName: publicEventName(event as EventRow),
      url: memberLinkUrl(input.requestUrl, event.slug, "konfirmasi", token),
    });
  } catch (error) {
    return { state: "failed" as const, error: error instanceof Error ? error.message : "gagal" };
  }
}

/**
 * "Kirim ulang" di pita konfirmasi area peserta. Pemiliknya sudah masuk, jadi
 * tidak ada yang bisa ditebak dari jawabannya; batasnya tiga per 15 menit.
 */
export async function resendConfirmationLink(
  event: Pick<EventRow, "id" | "slug" | "name" | "landing_config">,
  input: { accountId: string; email: string; name: string; requestUrl: string },
): Promise<{ status: "sent" | "not_configured" | "rate_limited" | "failed" }> {
  if (!isEmailConfigured()) return { status: "not_configured" };
  const { count } = await getSupabaseServiceClient()
    .from("participant_account_tokens")
    .select("id", { head: true, count: "exact" })
    .eq("account_id", input.accountId)
    .eq("purpose", "konfirmasi")
    .gte("created_at", new Date(Date.now() - JENDELA_EMAIL).toISOString());
  if ((count ?? 0) >= BATAS_EMAIL) return { status: "rate_limited" };
  const hasil = await sendConfirmationLink(event, input);
  return { status: hasil.state === "sent" ? "sent" : hasil.state === "not_configured" ? "not_configured" : "failed" };
}

export type LinkRequestOutcome =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed" };

/**
 * "Kirim tautan ke email". Jawabannya SAMA untuk email yang terdaftar maupun
 * tidak (`sent`), juga saat kena batas, supaya formulir ini tidak bisa dipakai
 * menebak siapa yang mendaftar. Pengecualiannya hanya kondisi server (email
 * belum aktif, penyedia gagal).
 *
 * Batasnya dihitung per PERMINTAAN (participant_link_requests), bukan per
 * token: token hanya dibuat untuk email yang cocok, jadi menghitung token
 * membuat batas itu hanya menggigit email terdaftar dan membocorkannya.
 */
export async function requestPasswordLink(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; ip: string | null; requestUrl: string },
): Promise<LinkRequestOutcome> {
  if (!isEmailConfigured()) return { status: "not_configured" };
  const email = normalizeEmail(input.email);
  const client = getSupabaseServiceClient();

  const [perEmail, perIp] = await Promise.all([
    client
      .from("participant_link_requests")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", event.id)
      .eq("email", email)
      .gte("created_at", new Date(Date.now() - JENDELA_EMAIL).toISOString()),
    input.ip
      ? client
        .from("participant_link_requests")
        .select("id", { head: true, count: "exact" })
        .eq("event_id", event.id)
        .eq("ip", input.ip)
        .gte("created_at", new Date(Date.now() - JENDELA_IP).toISOString())
      : Promise.resolve({ count: 0 }),
  ]);
  await client.from("participant_link_requests").insert({ event_id: event.id, email, ip: input.ip } as never);
  if ((perEmail.count ?? 0) >= BATAS_EMAIL || (perIp.count ?? 0) >= BATAS_IP) return { status: "sent" };

  const sasaran = await cariSasaran(event, member, email);
  if (!sasaran) return { status: "sent" };

  // Peserta impor yang belum dibuka aksesnya ("Siapa yang bisa masuk" =
  // peserta disetujui). Tetap dikabari lewat email, bukan dibiarkan menunggu
  // tautan yang tidak akan datang; layarnya tetap sama.
  if (sasaran.tertutup) {
    const hasil = await sendMemberLink({ eventId: event.id, kind: "tertutup", to: email, name: sasaran.name, eventName: publicEventName(event), url: null });
    return hasil.state === "sent" ? { status: "sent" } : { status: "failed" };
  }

  try {
    const token = await buatToken(event.id, "sandi", email, sasaran.sasaran);
    const hasil = await sendMemberLink({
      eventId: event.id,
      kind: "sandi",
      to: email,
      name: sasaran.name,
      eventName: publicEventName(event),
      url: memberLinkUrl(input.requestUrl, event.slug, "sandi", token),
    });
    return hasil.state === "sent" ? { status: "sent" } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

/** Akun yang sudah ada, lalu peserta tanpa akun, lalu pendaftaran tanpa akun. */
async function cariSasaran(
  event: EventRow,
  member: LandingMemberConfig,
  email: string,
): Promise<{ sasaran: Sasaran; name: string | null; tertutup?: true } | null> {
  const client = getSupabaseServiceClient();
  const { data: akun } = await client
    .from("participant_accounts")
    .select("id")
    .eq("event_id", event.id)
    .eq("email", email)
    .maybeSingle();
  if (akun) return { sasaran: { accountId: (akun as { id: string }).id }, name: null };

  const { data: daftarPeserta } = await client
    .from("participants")
    .select("id,name,email")
    .eq("event_id", event.id)
    .ilike("email", email)
    .is("source_removed_at", null);
  let tertutup: { name: string } | null = null;
  for (const p of (daftarPeserta ?? []) as { id: string; name: string; email: string | null }[]) {
    if (normalizeEmail(p.email ?? "") !== email) continue;
    if (await eligible(event.id, p.id, member)) return { sasaran: { participantId: p.id }, name: p.name };
    tertutup ??= { name: p.name };
  }

  const { data: reg } = await client
    .from("event_registrations")
    .select("id,name,status")
    .eq("event_id", event.id)
    .eq("email", email)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (reg) return { sasaran: { registrationId: (reg as { id: string }).id }, name: (reg as { name: string }).name };
  if (tertutup) return { sasaran: {}, name: tertutup.name, tertutup: true };
  return null;
}

type BarisToken = {
  id: string;
  purpose: "konfirmasi" | "sandi" | "undangan";
  email: string;
  account_id: string | null;
  participant_id: string | null;
  registration_id: string | null;
  expires_at: string;
  used_at: string | null;
};

/**
 * `sandi` juga menerima tautan `undangan`: keduanya membuka halaman buat kata
 * sandi yang sama (`?sandi=`), jadi membuka tautan tidak pernah memakainya;
 * baru menekan Simpan yang memakai. Itu yang menjaga tautan dari pemindai
 * tautan email kantor dan pratinjau tautan, yang membuka URL lebih dulu.
 */
async function bacaToken(eventId: string, token: string, purpose: "konfirmasi" | "sandi"): Promise<BarisToken | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await getSupabaseServiceClient()
    .from("participant_account_tokens")
    .select("id,purpose,email,account_id,participant_id,registration_id,expires_at,used_at")
    .eq("token_hash", hashToken(token))
    .eq("event_id", eventId)
    .in("purpose", purpose === "sandi" ? ["sandi", "undangan"] : [purpose])
    .maybeSingle();
  const baris = data as BarisToken | null;
  if (!baris || baris.used_at || new Date(baris.expires_at).getTime() < Date.now()) return null;
  return baris;
}

/** Untuk halaman/dialog: tautan sandi ini masih berlaku? Tidak memakai tautannya. */
export async function peekPasswordToken(eventId: string, token: string) {
  const baris = await bacaToken(eventId, token, "sandi");
  return baris ? { email: baris.email } : null;
}

export type SetPasswordOutcome = { status: "ok" } | { status: "invalid" } | { status: "not_eligible" } | { status: "conflict" };

export async function setPasswordWithToken(
  event: EventRow,
  member: LandingMemberConfig,
  input: { token: string; password: string },
): Promise<SetPasswordOutcome> {
  const baris = await bacaToken(event.id, input.token, "sandi");
  if (!baris) return { status: "invalid" };
  const client = getSupabaseServiceClient();

  // Dipakai lebih dulu, baru diproses: dua kiriman serentak dengan tautan yang
  // sama, hanya satu yang lolos `used_at is null`.
  const { data: dipakai } = await client
    .from("participant_account_tokens")
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", baris.id)
    .is("used_at", null)
    .select("id");
  if (!dipakai || (dipakai as unknown[]).length === 0) return { status: "invalid" };

  const sekarang = new Date().toISOString();
  const password_hash = await bcrypt.hash(input.password, HASH_ROUNDS);
  let accountId = baris.account_id;

  if (accountId) {
    const { error } = await client
      .from("participant_accounts")
      .update({ password_hash, password_set_at: sekarang, email_verified_at: sekarang, last_login_at: sekarang } as never)
      .eq("id", accountId);
    if (error) return { status: "invalid" };
    // Mengganti kata sandi mengeluarkan semua perangkat lain.
    await client.from("participant_sessions").delete().eq("account_id", accountId);
  } else {
    let participantId = baris.participant_id;
    if (participantId && !(await eligible(event.id, participantId, member))) return { status: "not_eligible" };
    if (!participantId && baris.registration_id) {
      const { data: reg } = await client
        .from("event_registrations")
        .select("participant_id,status")
        .eq("id", baris.registration_id)
        .maybeSingle();
      const r = reg as { participant_id: string | null; status: string } | null;
      if (!r || r.status === "rejected") return { status: "not_eligible" };
      participantId = r.participant_id;
    }
    const { data: akun, error } = await client
      .from("participant_accounts")
      .insert({
        event_id: event.id,
        participant_id: participantId,
        registration_id: baris.registration_id,
        email: baris.email,
        password_hash,
        email_verified_at: sekarang,
        last_login_at: sekarang,
      } as never)
      .select("id")
      .single();
    if (error || !akun) return error?.code === "23505" ? { status: "conflict" } : { status: "invalid" };
    accountId = (akun as { id: string }).id;
  }

  await clearGate(event.id, baris.email);
  await startSession(accountId);
  return { status: "ok" };
}

/** Tautan konfirmasi email. Benar = email akun itu terbukti. */
export async function confirmEmail(event: Pick<EventRow, "id">, token: string) {
  const baris = await bacaToken(event.id, token, "konfirmasi");
  if (!baris?.account_id) return false;
  const client = getSupabaseServiceClient();
  await client.from("participant_account_tokens").update({ used_at: new Date().toISOString() } as never).eq("id", baris.id);
  await client
    .from("participant_accounts")
    .update({ email_verified_at: new Date().toISOString() } as never)
    .eq("id", baris.account_id)
    .is("email_verified_at", null);
  return true;
}

