import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { CurrentUser } from "./roles";

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

function encodeSession(id: string) {
  return `${id}.${sign(id)}`;
}

function validSession(value: string) {
  const [id, signature] = value.split(".");
  if (!id || !signature || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = sign(id);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
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

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(user.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS, path: "/" });
  return { status: "ok", user: { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id } };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = raw ? validSession(raw) : null;
  if (!id) return null;
  const { data: user } = await getSupabaseServiceClient().from("users").select("id,username,role,booth_id,is_active").eq("id", id).eq("is_active", true).single() as { data: { id: string; username: string; role: "booth" | "cashier" | "admin"; booth_id: number | null; is_active: boolean } | null };
  return user ? { id: user.id, username: user.username, role: user.role, booth_id: user.booth_id } : null;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}
