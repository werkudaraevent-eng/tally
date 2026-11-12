import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { CurrentUser, UserRole } from "./roles";

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
// `loginWithPin` menulis ulang hash lama begitu PIN-nya terbukti benar, sehingga
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
function tabelBelumAda(error: { code?: string } | null) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

// Diingat per instans begitu terbukti ada; tabel tidak akan hilang lagi.
let tabelSesiAda = false;

async function tabelSesiTersedia(): Promise<boolean | null> {
  if (tabelSesiAda) return true;
  // GET, bukan HEAD: jawaban HEAD tidak membawa body, jadi kode galat
  // "tabel belum ada" tidak terbaca.
  const { error } = await getSupabaseServiceClient().from("staff_sessions").select("id").limit(1);
  if (!error) {
    tabelSesiAda = true;
    return true;
  }
  return tabelBelumAda(error) ? false : null;
}

/**
 * Buat sesi di server dan kembalikan nilai cookie. Bila tabel sesi belum ada
 * (kode sampai lebih dulu daripada migrasi), jatuh ke cookie bentuk lama supaya
 * staf tetap bisa masuk.
 */
async function createSession(userId: string, seconds: number) {
  const client = getSupabaseServiceClient();
  const token = randomBytes(32).toString("base64url");
  const { error } = await client.from("staff_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
  } as never);
  if (error) {
    if (tabelBelumAda(error)) return `${userId}.${sign(userId)}`;
    throw new Error("Could not create the session.");
  }
  tabelSesiAda = true;
  // Rapikan sesi kedaluwarsa akun ini. Gagal pun tidak apa-apa.
  await client.from("staff_sessions").delete().eq("user_id", userId).lt("expires_at", new Date().toISOString());
  return token;
}

// Hasil percobaan login. `retry_after_seconds` hanya berarti pada RATE_LIMITED.
export type LoginOutcome =
  | { status: "ok"; user: CurrentUser }
  | { status: "invalid" }
  | { status: "rate_limited"; retryAfterSeconds: number };

export async function loginWithPin(username: string, pin: string, rememberMe = false): Promise<LoginOutcome> {
  const client = getSupabaseServiceClient();
  const trimmed = username.trim();

  // Dipanggil SEBELUM baris user diambil dan sebelum bcrypt dijalankan.
  //
  // Urutan ini adalah inti perbaikannya. Rate limit yang memeriksa setelah bcrypt
  // tidak menyelesaikan apa pun: biaya yang menahan event loop — dan karenanya
  // menahan pembuatan order booth — sudah dikeluarkan sebelum penolakan terjadi.
  //
  // Fungsinya menaikkan penghitung secara atomik, bukan hanya membacanya. Versi
  // pertama memisahkan "periksa" dari "catat kegagalan", dan pengukuran menunjukkan
  // pemisahan itu tidak menahan apa pun terhadap permintaan PARALEL: kedua puluh
  // permintaan membaca penghitung sebelum salah satu pun menaikkannya, jadi
  // kedua puluhnya masuk ke bcrypt. Serangan otomatis selalu paralel.
  const { data: gate } = await client.rpc("begin_login_attempt" as never, { p_username: trimmed } as never);
  const gateResult = gate as { allowed?: boolean; retry_after_seconds?: number } | null;
  // `=== false` dengan sengaja, bukan `!gateResult?.allowed`. Bila pemeriksaan
  // gagal (database sesaat tidak terjangkau), login harus TETAP DICOBA. Menolak
  // seluruh login karena penghitung tidak terbaca akan mengunci seluruh panitia
  // dari sistemnya sendiri di tengah acara — kerugiannya jauh lebih besar daripada
  // beberapa percobaan brute force yang lolos.
  if (gateResult?.allowed === false) {
    return { status: "rate_limited", retryAfterSeconds: gateResult.retry_after_seconds ?? 60 };
  }

  const { data: user } = await client.from("users").select("id,username,pin_hash,role,booth_id,is_active").eq("username", trimmed).eq("is_active", true).single() as { data: { id: string; username: string; pin_hash: string; role: "booth" | "cashier" | "admin"; booth_id: number | null; is_active: boolean } | null };

  // Username tidak dikenal TIDAK memanggil bcrypt.
  //
  // Perbedaan waktu antara kedua cabang memang dapat diamati, sehingga secara teori
  // membocorkan username mana yang ada. Diterima dengan sadar: daftar username
  // panitia bukan rahasia — tercetak di panduan meja booth — sementara memanggil
  // bcrypt pada hash tiruan hanya untuk menyamakan waktu justru mengembalikan tepat
  // masalah yang sedang diperbaiki, dan membuat serangan pada username acak dapat
  // menahan event loop.
  if (!user) return { status: "invalid" };
  if (!(await bcrypt.compare(pin, user.pin_hash))) return { status: "invalid" };

  // Penghitung dibersihkan hanya setelah PIN benar. Karena `begin_login_attempt`
  // menaikkan hitungan untuk SETIAP percobaan termasuk yang berhasil, penghapusan
  // di sini adalah yang membuat operator yang bekerja normal tidak pernah menumpuk
  // hitungan sama sekali.
  await client.rpc("clear_login_attempts" as never, { p_username: trimmed } as never);

  // Hash lama menyimpan cost-nya sendiri di dalam string, jadi PIN yang dibuat saat
  // cost masih 12 tetap membutuhkan ~526ms untuk diverifikasi. Hash ditulis ulang
  // dengan cost sekarang begitu PIN terbukti benar, sehingga login berikutnya untuk
  // operator itu memakai biaya yang baru tanpa ada yang perlu mengganti PIN.
  // Kegagalannya diabaikan: hash lama tetap sah, jadi rugi terburuknya hanya
  // kesempatan yang terlewat — bukan operator yang gagal masuk.
  if (!user.pin_hash.startsWith(`$2b$${PIN_HASH_ROUNDS}$`) && !user.pin_hash.startsWith(`$2a$${PIN_HASH_ROUNDS}$`)) {
    const upgraded = await bcrypt.hash(pin, PIN_HASH_ROUNDS);
    await client.from("users").update({ pin_hash: upgraded } as never).eq("id", user.id);
  }

  const seconds = rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS;
  const value = await createSession(user.id, seconds);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: seconds, path: "/" });
  return { status: "ok", user: { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id } };
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
  const { error } = await kueri;
  if (error && !tabelBelumAda(error)) throw new Error("Could not sign out the other devices.");
}
