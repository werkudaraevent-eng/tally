import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Area peserta: akun email + kata sandi per acara.
 *
 * Terpisah total dari login panitia (`src/lib/auth/login.ts`): tabel lain,
 * cookie lain, dan tidak ada satu pun jalur dari sesi peserta ke `users`.
 *
 * Kata sandi dibuat di dua tempat:
 *   - formulir pendaftaran, bila area peserta menyala (createAccountForRegistration);
 *   - tautan sekali pakai dari email (setPasswordWithToken), untuk peserta impor
 *     panitia, pendaftar lama, dan lupa kata sandi.
 * Kode peserta TIDAK lagi dipakai untuk membuat kata sandi: kodenya pendek dan
 * tercetak di undangan, sedangkan tautan email membuktikan pemilik kotak masuk.
 *
 * Batas percobaan per email lewat `begin_login_attempt` yang sama dengan login
 * panitia, dengan kunci ber-awalan `peserta:` supaya tidak pernah bertabrakan
 * dengan username panitia.
 */

const COOKIE = "tally_peserta";
const SESSION_DAYS = 30;
/** Biaya bcrypt. Sama dengan PIN panitia; alasannya di login.ts. */
export const HASH_ROUNDS = 10;
/** bcrypt hanya membaca 72 bita pertama. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export type MemberParticipant = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  qr_code: string;
  seats: { subEventId?: string | number; subEventName?: string | null; label?: string | null }[] | null;
};

/**
 * `participant` kosong selama pendaftarannya belum disetujui (atau ditolak):
 * akunnya sudah ada sejak formulir dikirim, tetapi baris peserta baru dibuat
 * saat disetujui. Area peserta lalu hanya menampilkan statusnya.
 */
export type MemberSession = {
  accountId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  status: "approved" | "pending" | "rejected";
  participant: MemberParticipant | null;
};

export type MemberOutcome =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "not_eligible" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "conflict" };

const PARTICIPANT_COLUMNS = "id,name,company,title,email,qr_code,seats";

export function memberConfig(event: Pick<EventRow, "landing_config">): LandingMemberConfig | null {
  const member = ((event.landing_config ?? {}) as EventLandingConfig).member;
  return member?.enabled ? member : null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Batas percobaan. `allowed === false` saja yang menolak: bila penghitungnya
 * sesaat tidak terbaca, percobaan tetap jalan (alasan yang sama dengan login
 * panitia: mengunci semua orang karena database tersendat lebih merugikan).
 */
export async function gate(eventId: string, email: string): Promise<MemberOutcome | null> {
  const { data } = await getSupabaseServiceClient().rpc(
    "begin_login_attempt" as never,
    { p_username: `peserta:${eventId}:${email}` } as never,
  );
  const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (result?.allowed === false) return { status: "rate_limited", retryAfterSeconds: result.retry_after_seconds ?? 60 };
  return null;
}

export async function clearGate(eventId: string, email: string) {
  await getSupabaseServiceClient().rpc("clear_login_attempts" as never, { p_username: `peserta:${eventId}:${email}` } as never);
}

/** Apakah peserta ini boleh punya akun, menurut setelan `audience`. */
export async function eligible(eventId: string, participantId: string, member: LandingMemberConfig) {
  if ((member.audience ?? "approved") === "all") return true;
  const { data } = await getSupabaseServiceClient()
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .eq("status", "approved")
    .limit(1);
  return (data ?? []).length > 0;
}

export async function startSession(accountId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await getSupabaseServiceClient()
    .from("participant_sessions")
    .insert({ account_id: accountId, token_hash: hashToken(token), expires_at: expires.toISOString() } as never);
  if (error) throw new Error("Sesi peserta gagal dibuat.");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/**
 * Akun dari formulir pendaftaran. Dipanggil SETELAH pendaftarannya tersimpan;
 * berhasil = langsung masuk di perangkat ini.
 *
 * `participantId` terisi bila acaranya setujui otomatis. Pada acara bermoderasi
 * kosong, dan pemicu `event_registrations_link_account` mengisinya saat
 * panitia menyetujui.
 *
 * `conflict`: email ini sudah punya akun di acara ini lewat jalur lain (peserta
 * impor yang sudah membuat kata sandi). Pendaftarannya tetap tersimpan; akun
 * lama tidak ditimpa.
 */
export async function createAccountForRegistration(
  event: Pick<EventRow, "id">,
  input: { registrationId: string; participantId: string | null; email: string; password: string },
): Promise<{ status: "ok"; accountId: string } | { status: "conflict" } | { status: "failed" }> {
  const email = normalizeEmail(input.email);
  const password_hash = await bcrypt.hash(input.password, HASH_ROUNDS);
  const { data, error } = await getSupabaseServiceClient()
    .from("participant_accounts")
    .insert({
      event_id: event.id,
      registration_id: input.registrationId,
      participant_id: input.participantId,
      email,
      password_hash,
      last_login_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (error || !data) return error?.code === "23505" ? { status: "conflict" } : { status: "failed" };
  const accountId = (data as { id: string }).id;
  await startSession(accountId);
  return { status: "ok", accountId };
}

export async function loginMember(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; password: string },
): Promise<MemberOutcome> {
  const email = normalizeEmail(input.email);
  const blocked = await gate(event.id, email);
  if (blocked) return blocked;

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("participant_accounts")
    .select("id,participant_id,password_hash")
    .eq("event_id", event.id)
    .eq("email", email)
    .maybeSingle();
  const akun = data as { id: string; participant_id: string | null; password_hash: string } | null;
  if (!akun || !(await bcrypt.compare(input.password, akun.password_hash))) return { status: "invalid" };

  // Diperiksa ulang setiap masuk: panitia bisa mengubah `audience` atau
  // peserta bisa dikeluarkan setelah akunnya dibuat. Akun yang pendaftarannya
  // belum disetujui tetap boleh masuk; area peserta hanya menampilkan statusnya.
  if (akun.participant_id) {
    const { data: peserta } = await client
      .from("participants")
      .select("id")
      .eq("id", akun.participant_id)
      .is("source_removed_at", null)
      .maybeSingle();
    if (!peserta || !(await eligible(event.id, akun.participant_id, member))) return { status: "not_eligible" };
  }

  await clearGate(event.id, email);
  await client.from("participant_accounts").update({ last_login_at: new Date().toISOString() } as never).eq("id", akun.id);
  await startSession(akun.id);
  return { status: "ok" };
}

/**
 * Sesi peserta untuk acara ini, atau null. Sesi dari acara lain dianggap tidak
 * ada: cookie-nya satu, tetapi akunnya terikat pada satu acara.
 */
export async function getMemberSession(event: Pick<EventRow, "id" | "landing_config">): Promise<MemberSession | null> {
  const member = memberConfig(event);
  if (!member) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("participant_sessions")
    .select("id,expires_at,participant_accounts!inner(id,event_id,email,participant_id,registration_id,email_verified_at)")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const sesi = data as {
    id: string;
    participant_accounts: {
      id: string;
      event_id: string;
      email: string;
      participant_id: string | null;
      registration_id: string | null;
      email_verified_at: string | null;
    };
  } | null;
  if (!sesi || sesi.participant_accounts.event_id !== event.id) return null;
  const akun = sesi.participant_accounts;
  const dasar = {
    accountId: akun.id,
    sessionId: sesi.id,
    email: akun.email,
    emailVerified: Boolean(akun.email_verified_at),
  };

  if (akun.participant_id) {
    const { data: peserta } = await client
      .from("participants")
      .select(PARTICIPANT_COLUMNS)
      .eq("id", akun.participant_id)
      .is("source_removed_at", null)
      .maybeSingle();
    if (!peserta) return null;
    const p = peserta as unknown as MemberParticipant;
    return { ...dasar, name: p.name, status: "approved", participant: p };
  }

  if (!akun.registration_id) return null;
  const { data: reg } = await client
    .from("event_registrations")
    .select("name,status")
    .eq("id", akun.registration_id)
    .maybeSingle();
  const r = reg as { name: string; status: string } | null;
  if (!r) return null;
  return { ...dasar, name: r.name, status: r.status === "rejected" ? "rejected" : "pending", participant: null };
}

export async function logoutMember() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token && token.length <= 100) {
    await getSupabaseServiceClient().from("participant_sessions").delete().eq("token_hash", hashToken(token));
  }
  store.delete(COOKIE);
}
