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
 * Kata sandi dibuat peserta sendiri dengan bukti dua hal yang hanya ia punya:
 * email pendaftarannya dan kode peserta di undangannya. Dua-duanya harus cocok
 * pada baris peserta yang sama. Kode peserta pendek (REG + 6 digit), jadi
 * pertahanannya adalah batas percobaan per email lewat `begin_login_attempt`
 * yang sama dengan login panitia, dengan kunci ber-awalan `peserta:` supaya
 * tidak pernah bertabrakan dengan username panitia.
 */

const COOKIE = "tally_peserta";
const SESSION_DAYS = 30;
/** Biaya bcrypt. Sama dengan PIN panitia; alasannya di login.ts. */
const HASH_ROUNDS = 10;
/** bcrypt hanya membaca 72 bita pertama. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export type MemberParticipant = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  qr_code: string;
  /** "confirmed" = konfirmasi hadir. */
  rsvp_status: string | null;
  /** Jenis undangan bebas isi panitia, mis. "VIP". */
  participant_type: string | null;
  seats: { subEventId?: string | number; subEventName?: string | null; label?: string | null }[] | null;
};

export type MemberSession = {
  accountId: string;
  sessionId: string;
  email: string;
  participant: MemberParticipant;
};

export type MemberOutcome =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "not_eligible" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "conflict" };

const PARTICIPANT_COLUMNS = "id,name,company,title,email,phone,qr_code,rsvp_status,participant_type,seats";

export function memberConfig(event: Pick<EventRow, "landing_config">): LandingMemberConfig | null {
  const member = ((event.landing_config ?? {}) as EventLandingConfig).member;
  return member?.enabled ? member : null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Batas percobaan. `allowed === false` saja yang menolak: bila penghitungnya
 * sesaat tidak terbaca, percobaan tetap jalan (alasan yang sama dengan login
 * panitia: mengunci semua orang karena database tersendat lebih merugikan).
 */
async function gate(eventId: string, email: string): Promise<MemberOutcome | null> {
  const { data } = await getSupabaseServiceClient().rpc(
    "begin_login_attempt" as never,
    { p_username: `peserta:${eventId}:${email}` } as never,
  );
  const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  if (result?.allowed === false) return { status: "rate_limited", retryAfterSeconds: result.retry_after_seconds ?? 60 };
  return null;
}

async function clearGate(eventId: string, email: string) {
  await getSupabaseServiceClient().rpc("clear_login_attempts" as never, { p_username: `peserta:${eventId}:${email}` } as never);
}

/** Apakah peserta ini boleh punya akun, menurut setelan `audience`. */
async function eligible(eventId: string, participantId: string, member: LandingMemberConfig) {
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

async function startSession(accountId: string) {
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
 * Membuat kata sandi (atau menggantinya bila lupa) dengan email + kode peserta.
 * Mengganti kata sandi mengeluarkan semua sesi lama akun itu.
 */
export async function activateWithCode(
  event: EventRow,
  member: LandingMemberConfig,
  input: { email: string; code: string; password: string },
): Promise<MemberOutcome> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim().toUpperCase();
  const blocked = await gate(event.id, email);
  if (blocked) return blocked;

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("participants")
    .select("id,email,qr_code,source_removed_at")
    .eq("event_id", event.id)
    .ilike("email", email)
    .is("source_removed_at", null);
  const peserta = ((data ?? []) as { id: string; email: string | null; qr_code: string }[]).find(
    (row) => normalizeEmail(row.email ?? "") === email && row.qr_code.trim().toUpperCase() === code,
  );
  if (!peserta) return { status: "invalid" };
  if (!(await eligible(event.id, peserta.id, member))) return { status: "not_eligible" };

  const password_hash = await bcrypt.hash(input.password, HASH_ROUNDS);
  const { data: akun, error } = await client
    .from("participant_accounts")
    .upsert(
      { event_id: event.id, participant_id: peserta.id, email, password_hash, password_set_at: new Date().toISOString() } as never,
      { onConflict: "participant_id" },
    )
    .select("id")
    .single();
  // Unik (event_id, email): dua baris peserta dengan email yang sama di satu
  // acara. Akun kedua ditolak alih-alih menimpa milik orang lain.
  if (error || !akun) return error?.code === "23505" ? { status: "conflict" } : { status: "invalid" };

  const accountId = (akun as { id: string }).id;
  await client.from("participant_sessions").delete().eq("account_id", accountId);
  await clearGate(event.id, email);
  await client.from("participant_accounts").update({ last_login_at: new Date().toISOString() } as never).eq("id", accountId);
  await startSession(accountId);
  return { status: "ok" };
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
  const akun = data as { id: string; participant_id: string; password_hash: string } | null;
  if (!akun || !(await bcrypt.compare(input.password, akun.password_hash))) return { status: "invalid" };

  // Diperiksa ulang setiap masuk: panitia bisa mengubah `audience` atau
  // peserta bisa dikeluarkan setelah akunnya dibuat.
  const { data: peserta } = await client
    .from("participants")
    .select("id")
    .eq("id", akun.participant_id)
    .is("source_removed_at", null)
    .maybeSingle();
  if (!peserta || !(await eligible(event.id, akun.participant_id, member))) return { status: "not_eligible" };

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
    .select("id,expires_at,participant_accounts!inner(id,event_id,email,participant_id)")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const sesi = data as {
    id: string;
    participant_accounts: { id: string; event_id: string; email: string; participant_id: string };
  } | null;
  if (!sesi || sesi.participant_accounts.event_id !== event.id) return null;

  const { data: peserta } = await client
    .from("participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("id", sesi.participant_accounts.participant_id)
    .is("source_removed_at", null)
    .maybeSingle();
  if (!peserta) return null;

  return {
    accountId: sesi.participant_accounts.id,
    sessionId: sesi.id,
    email: sesi.participant_accounts.email,
    participant: peserta as unknown as MemberParticipant,
  };
}

export async function logoutMember() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token && token.length <= 100) {
    await getSupabaseServiceClient().from("participant_sessions").delete().eq("token_hash", hashToken(token));
  }
  store.delete(COOKIE);
}
