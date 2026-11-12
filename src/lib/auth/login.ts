import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { CurrentUser, UserRole } from "./roles";
import { bukaPending, bungkusPending, butuhDuaLangkah, cocokSandi, kunciDuaLangkahSiap, PENDING_COOKIE, PENDING_DETIK, type Tahap } from "./kredensial";

const SESSION_COOKIE = "tally_session";
// Default menutupi durasi acara penuh (BR non-functional: jangan auto-logout
// selama event). "Ingat saya" memperpanjang hingga 30 hari untuk device panitia
// yang dipakai berulang kali.
const SESSION_SECONDS = 12 * 60 * 60;
const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60;

// Biaya bcrypt untuk PIN operator.
//
// Diturunkan dari 12 ke 10. Diukur di mesin pengembangan, di bawah beban paralel:
//   cost 12 = 1807ms per compare  (526ms bila dijalankan sendirian)
//   cost 10 =  312ms per compare
// `bcryptjs` adalah JavaScript murni, jadi angka itu adalah event loop Node yang
// TERTAHAN PENUH — jeda terburuk terukur 991ms saat sepuluh compare berjalan.
// Selama itu tidak ada route handler lain yang jalan, termasuk pembuatan order
// booth. Terukur: satu submit order melambat dari 954ms menjadi 14.583ms ketika
// 20 percobaan login berjalan bersamaan.
//
// Menurunkan cost bukan pelemahan yang berarti di sini. Rahasianya adalah PIN 6
// digit, ruangnya 10^6 = satu juta kemungkinan. Cost 12 tidak membuat ruang itu
// lebih besar; ia hanya membeli latensi. Pertahanan yang benar untuk ruang sekecil
// itu adalah membatasi jumlah percobaan, dan itulah yang dilakukan
// `begin_login_attempt` — enam percobaan per sepuluh menit membuat pencarian
// menyeluruh butuh bertahun-tahun berapa pun cost-nya.
//
// Hash lama cost 12 TETAP BERLAKU: bcrypt menyimpan cost di dalam string hash,
// jadi `compare` membacanya dari sana. Konstanta ini menentukan hash BARU, dan
// `loginStaff` menulis ulang hash lama begitu PIN-nya terbukti benar, sehingga
// tidak ada seorang pun perlu mengganti PIN untuk mendapat biaya yang baru.
export const PIN_HASH_ROUNDS = 10;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing.");
  return secret;
}

function sign(id: string) {
  return createHmac("sha256", sessionSecret()).update(id).digest("hex");
}

/**
 * Cookie bentuk lama `<user id>.<HMAC>`: tanda tangan tanpa catatan di server,
 * jadi tidak bisa dicabut. Hanya diterima selama tabel staff_sessions belum ada
 * (kode ini boleh sampai lebih dulu daripada migrasi 202611130001). Begitu
 * tabelnya ada, cookie lama ditolak dan pemiliknya masuk ulang sekali.
 */
function legacySessionId(value: string) {
  const [id, signature] = value.split(".");
  if (!id || !signature || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = sign(id);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Token baru: 32 byte acak base64url (43 karakter, tanpa titik). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** PostgREST: tabel belum ada di schema cache / Postgres: relasi tidak ada. */
// PostgREST 13+ menjawab PGRST205, Postgres 42P01. PostgREST 12 menjawab tulis
// ke tabel yang tidak ada dengan 404 tanpa kode sama sekali (lihat juga
// tabelBadgeBelumAda di lib/badge/load.ts).
function tabelBelumAda(error: { code?: string } | null, status?: number) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || (status === 404 && !error.code);
}

// Diingat per instans begitu terbukti ada; tabel tidak akan hilang lagi.
let tabelSesiAda = false;

async function tabelSesiTersedia(): Promise<boolean | null> {
  if (tabelSesiAda) return true;
  // GET, bukan HEAD: jawaban HEAD tidak membawa body, jadi kode galat
  // "tabel belum ada" tidak terbaca.
  const { error, status } = await getSupabaseServiceClient().from("staff_sessions").select("id").limit(1);
  if (!error) {
    tabelSesiAda = true;
    return true;
  }
  return tabelBelumAda(error, status) ? false : null;
}

/**
 * Buat sesi di server dan kembalikan nilai cookie. Bila tabel sesi belum ada
 * (kode sampai lebih dulu daripada migrasi), jatuh ke cookie bentuk lama supaya
 * staf tetap bisa masuk.
 */
async function createSession(userId: string, seconds: number) {
  const client = getSupabaseServiceClient();
  const token = randomBytes(32).toString("base64url");
  const { error, status } = await client.from("staff_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
  } as never);
  if (error) {
    if (tabelBelumAda(error, status)) return `${userId}.${sign(userId)}`;
    throw new Error("Could not create the session.");
  }
  tabelSesiAda = true;
  // Rapikan sesi kedaluwarsa akun ini. Gagal pun tidak apa-apa.
  await client.from("staff_sessions").delete().eq("user_id", userId).lt("expires_at", new Date().toISOString());
  return token;
}

// Hasil percobaan login. `retry_after_seconds` hanya berarti pada RATE_LIMITED.
// `next`: langkah pertama lolos, tapi admin masih harus memasukkan kode
// authenticator ("totp") atau memasang kata sandi + authenticator ("setup").
export type LoginOutcome =
  | { status: "ok"; user: CurrentUser }
  | { status: "next"; tahap: Tahap }
  | { status: "invalid" }
  | { status: "rate_limited"; retryAfterSeconds: number };

type BarisMasuk = {
  id: string;
  username: string;
  pin_hash: string;
  role: UserRole;
  booth_id: number | null;
  is_active: boolean;
  access_role_id?: string | null;
  // Hanya ada setelah migrasi 202611130002. Sebelum itu kuncinya tidak ada sama
  // sekali (`select *`), dan semua akun masuk dengan PIN seperti dulu.
  password_hash?: string | null;
  totp_enabled_at?: string | null;
};

/**
 * Kunci penghitung percobaan: username + IP. Dulu username saja, sehingga
 * siapa pun yang tahu username admin (tercetak di panduan booth) bisa
 * menguncinya di hari H dengan enam tebakan salah. Kini kuncian hanya berlaku
 * untuk IP penebak; pemilik akun dari jaringan lain tetap bisa masuk.
 */
export function kunciPercobaan(username: string, ip: string | null, awalan = "") {
  return `${awalan}${username.trim()}@${ip ?? "?"}`;
}

/**
 * Gerbang percobaan, dipanggil SEBELUM baris user diambil dan sebelum hash
 * dijalankan (biayanya tidak boleh dikeluarkan dulu baru ditolak). Atomik di
 * database, jadi permintaan paralel ikut terhitung. Bila pemeriksaan gagal
 * (database sesaat tidak terjangkau), login TETAP dicoba: mengunci seluruh
 * panitia di tengah acara lebih mahal daripada beberapa tebakan yang lolos.
 */
export async function gerbangPercobaan(kunci: string): Promise<LoginOutcome | null> {
  const { data } = await getSupabaseServiceClient().rpc("begin_login_attempt" as never, { p_username: kunci } as never);
  const hasil = data as { allowed?: boolean; retry_after_seconds?: number } | null;
  return hasil?.allowed === false ? { status: "rate_limited", retryAfterSeconds: hasil.retry_after_seconds ?? 60 } : null;
}

export async function bersihkanPercobaan(kunci: string) {
  await getSupabaseServiceClient().rpc("clear_login_attempts" as never, { p_username: kunci } as never);
}

const cookieAman = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" });

/** Buat sesi penuh dan pasang cookie-nya. */
export async function masukkan(userId: string, rememberMe: boolean) {
  const seconds = rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS;
  const value = await createSession(userId, seconds);
  const store = await cookies();
  store.set(SESSION_COOKIE, value, { ...cookieAman(), maxAge: seconds });
  store.delete(PENDING_COOKIE);
}

export async function pasangPending(p: Parameters<typeof bungkusPending>[0]) {
  (await cookies()).set(PENDING_COOKIE, bungkusPending(p), { ...cookieAman(), maxAge: PENDING_DETIK });
}

export async function bacaPending() {
  return bukaPending((await cookies()).get(PENDING_COOKIE)?.value);
}

/**
 * Langkah pertama masuk staf.
 *
 * - Akun perangkat (booth, kasir, scanner, viewer, custom): PIN 6 digit, sesi
 *   langsung dibuat.
 * - Admin/super admin dengan kata sandi: kata sandi, lalu kode authenticator.
 *   PIN lamanya tidak berlaku lagi.
 * - Admin/super admin yang belum punya kata sandi: PIN sekali lagi, lalu wajib
 *   memasang kata sandi + authenticator sebelum mendapat sesi.
 */
export async function loginStaff(username: string, rahasia: string, rememberMe: boolean, ip: string | null): Promise<LoginOutcome> {
  const client = getSupabaseServiceClient();
  const trimmed = username.trim();
  const kunci = kunciPercobaan(trimmed, ip);

  const tertahan = await gerbangPercobaan(kunci);
  if (tertahan) return tertahan;

  // `*`: password_hash dan totp_enabled_at datang dari migrasi 202611130002.
  const { data: user } = await client.from("users").select("*").eq("username", trimmed).eq("is_active", true).maybeSingle() as { data: BarisMasuk | null };

  // Username tidak dikenal tidak menjalankan hash (daftar username panitia
  // bukan rahasia; menyamakan waktu dengan hash tiruan justru menahan server).
  if (!user) return { status: "invalid" };

  // Aktif hanya setelah migrasi 202611130002 (kolomnya ada) dan bila rahasia
  // authenticator bisa disandikan di server ini.
  const duaLangkahAktif = "password_hash" in user && butuhDuaLangkah(user.role) && kunciDuaLangkahSiap();

  if (duaLangkahAktif && user.password_hash) {
    if (!(await cocokSandi(rahasia, user.password_hash))) return { status: "invalid" };
    await bersihkanPercobaan(kunci);
    // Kata sandi tanpa authenticator hanya terjadi bila setup terputus di
    // tengah; ulangi setup, jangan beri sesi.
    const tahap: Tahap = user.totp_enabled_at ? "totp" : "setup";
    await pasangPending({ u: user.id, t: tahap, ingat: rememberMe });
    return { status: "next", tahap };
  }

  if (!/^\d{6}$/.test(rahasia) || !user.pin_hash || !(await bcrypt.compare(rahasia, user.pin_hash))) return { status: "invalid" };
  await bersihkanPercobaan(kunci);

  // Hash lama menyimpan cost-nya sendiri; tulis ulang dengan cost sekarang begitu
  // PIN terbukti benar. Gagal pun tidak apa-apa: hash lama tetap sah.
  if (!user.pin_hash.startsWith(`$2b$${PIN_HASH_ROUNDS}$`) && !user.pin_hash.startsWith(`$2a$${PIN_HASH_ROUNDS}$`)) {
    const upgraded = await bcrypt.hash(rahasia, PIN_HASH_ROUNDS);
    await client.from("users").update({ pin_hash: upgraded } as never).eq("id", user.id);
  }

  if (duaLangkahAktif) {
    await pasangPending({ u: user.id, t: "setup", ingat: rememberMe });
    return { status: "next", tahap: "setup" };
  }

  await masukkan(user.id, rememberMe);
  return { status: "ok", user: { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id, access_role_id: user.access_role_id ?? null } };
}

type UserRow = { id: string; username: string; role: UserRole; booth_id: number | null; is_active: boolean; access_role_id?: string | null };

function toCurrentUser(user: UserRow): CurrentUser {
  return { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id, access_role_id: user.access_role_id ?? null };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const client = getSupabaseServiceClient();

  if (TOKEN_PATTERN.test(raw)) {
    // `users(*)`, bukan daftar kolom: access_role_id datang dari migrasi
    // 202610300003. Daftar kolom yang menyebutnya akan mengeluarkan SEMUA orang
    // bila kode ini sampai lebih dulu daripada migrasinya.
    const { data } = await client
      .from("staff_sessions")
      .select("expires_at, users(*)")
      .eq("token_hash", hashToken(raw))
      .maybeSingle() as { data: { expires_at: string; users: UserRow | null } | null };
    if (!data?.users || !data.users.is_active) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return toCurrentUser(data.users);
  }

  // Cookie bentuk lama: hanya sah sebelum migrasi sesi dijalankan. Bila
  // keberadaan tabel tidak bisa dipastikan (galat lain), tolak.
  const id = legacySessionId(raw);
  if (!id) return null;
  if ((await tabelSesiTersedia()) !== false) return null;
  const { data: user } = await client.from("users").select("*").eq("id", id).eq("is_active", true).single() as { data: UserRow | null };
  return user ? toCurrentUser(user) : null;
}

/** Keluar dari perangkat ini: hapus baris sesinya, lalu cookie-nya. */
export async function logout() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw && TOKEN_PATTERN.test(raw)) {
    await getSupabaseServiceClient().from("staff_sessions").delete().eq("token_hash", hashToken(raw));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Cabut semua sesi satu akun. Dipakai saat PIN diganti, akun dinonaktifkan, dan
 * "Keluar dari semua perangkat". `kecualiIni` membiarkan sesi di browser yang
 * meminta tetap masuk (orang yang mengganti PIN-nya sendiri).
 */
export async function revokeUserSessions(userId: string, kecualiIni = false) {
  let kueri = getSupabaseServiceClient().from("staff_sessions").delete().eq("user_id", userId);
  if (kecualiIni) {
    const raw = (await cookies()).get(SESSION_COOKIE)?.value;
    if (raw && TOKEN_PATTERN.test(raw)) kueri = kueri.neq("token_hash", hashToken(raw));
  }
  const { error, status } = await kueri;
  if (error && !tabelBelumAda(error, status)) throw new Error("Could not sign out the other devices.");
}

/**
 * Hapus kata sandi + authenticator + kode cadangan sebuah akun, dipanggil saat
 * super admin mereset PIN-nya (mis. HP hilang). Masuk berikutnya dengan PIN
 * baru langsung masuk ke setup ulang. Sebelum migrasi 202611130002 kolomnya
 * belum ada: tidak ada yang perlu dihapus.
 */
export async function hapusDuaLangkah(userId: string) {
  const { error } = await getSupabaseServiceClient().from("users")
    .update({ password_hash: null, totp_secret: null, totp_enabled_at: null, totp_last_step: null, recovery_codes: [] } as never)
    .eq("id", userId);
  if (error && error.code !== "PGRST204" && error.code !== "42703") throw new Error("Could not reset two-step sign-in.");
}
