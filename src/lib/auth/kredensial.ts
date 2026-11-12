import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Kredensial admin: kata sandi, rahasia authenticator, kode cadangan, dan
 * penanda "masuk setengah jalan" di antara langkah-langkahnya.
 *
 * Admin dan super admin masuk dengan kata sandi + kode authenticator (Mas,
 * 13 Nov). Akun perangkat (booth, kasir, scanner) tetap PIN 6 digit.
 */

const scrypt = promisify(scryptCb) as (sandi: string, garam: Buffer, panjang: number, opsi: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const ROLES_DUA_LANGKAH = ["admin", "super_admin"] as const;
export function butuhDuaLangkah(role: string): boolean {
  return (ROLES_DUA_LANGKAH as readonly string[]).includes(role);
}

// ---- Kata sandi ------------------------------------------------------------

export const SANDI_MIN = 12;
export const SANDI_MAX = 128;

/**
 * Aturan kata sandi menurut NIST SP 800-63B / OWASP ASVS 2.1: panjang minimal
 * 12, boleh spasi dan karakter apa pun, TANPA aturan komposisi (huruf besar,
 * simbol) yang hanya melahirkan "Password1!". Yang ditolak: terlalu pendek,
 * sama dengan username, atau satu karakter diulang.
 */
export function periksaSandi(sandi: string, username: string): string | null {
  if (sandi.length < SANDI_MIN) return `Use at least ${SANDI_MIN} characters.`;
  if (sandi.length > SANDI_MAX) return `Use at most ${SANDI_MAX} characters.`;
  if (sandi.trim().toLowerCase() === username.trim().toLowerCase()) return "Don't use your username as the password.";
  if (/^(.)\1+$/.test(sandi)) return "Don't repeat one character.";
  return null;
}

// scrypt bawaan Node berjalan di threadpool libuv, jadi tidak menahan event
// loop seperti bcryptjs (lihat catatan biaya di login.ts). N=2^15, r=8: ~32 MB,
// puluhan milidetik per percobaan.
const N = 32768;
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024;

export async function hashSandi(sandi: string): Promise<string> {
  const garam = randomBytes(16);
  const hasil = await scrypt(sandi.normalize("NFKC"), garam, 32, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, garam.toString("base64url"), hasil.toString("base64url")].join("$");
}

export async function cocokSandi(sandi: string, simpanan: string | null | undefined): Promise<boolean> {
  if (!simpanan) return false;
  const [algo, n, r, p, garam, hash] = simpanan.split("$");
  if (algo !== "scrypt" || !garam || !hash) return false;
  const harap = Buffer.from(hash, "base64url");
  const hasil = await scrypt(sandi.normalize("NFKC"), Buffer.from(garam, "base64url"), harap.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return hasil.length === harap.length && timingSafeEqual(hasil, harap);
}

// ---- Rahasia authenticator di database --------------------------------------

// AES-256-GCM, kunci HKDF dari INVITE_LINK_SECRET (tidak pernah dirotasi; pola
// sama dengan src/lib/ai/kunci.ts, label berbeda).
/**
 * Dua langkah hanya berlaku bila rahasia authenticator bisa disandikan. Tanpa
 * INVITE_LINK_SECRET yang cukup panjang, setup akan gagal terus dan admin
 * terkunci di halaman setup; lebih baik tetap masuk dengan PIN.
 */
export function kunciDuaLangkahSiap(): boolean {
  return (process.env.INVITE_LINK_SECRET?.length ?? 0) >= 32;
}

function kunci(): Buffer {
  const rahasia = process.env.INVITE_LINK_SECRET;
  if (!rahasia || rahasia.length < 32) throw new Error("INVITE_LINK_SECRET is missing or shorter than 32 characters.");
  return Buffer.from(hkdfSync("sha256", rahasia, "tally-staff-2fa", "totp-secret", 32));
}

export function sandikanRahasia(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const isi = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), isi.toString("base64url")].join(".");
}

export function bukaRahasia(sandi: string | null | undefined): string | null {
  if (!sandi) return null;
  const [v, iv, tag, isi] = sandi.split(".");
  if (v !== "v1" || !iv || !tag || !isi) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", kunci(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(isi, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- Kode cadangan ----------------------------------------------------------

const HURUF_KODE = "abcdefghjkmnpqrstuvwxyz23456789"; // tanpa i, l, o, 0, 1

/** 10 kode sekali pakai, bentuk "xxxx-xxxx". Hanya hash-nya yang disimpan. */
export function buatKodeCadangan(jumlah = 10): string[] {
  return Array.from({ length: jumlah }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => HURUF_KODE[x % HURUF_KODE.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function normalKodeCadangan(kode: string): string {
  return kode.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashKodeCadangan(kode: string): string {
  return createHash("sha256").update(normalKodeCadangan(kode)).digest("hex");
}

// ---- Masuk setengah jalan -----------------------------------------------------

export const PENDING_COOKIE = "tally_pending";
export const PENDING_DETIK = 10 * 60;

export type Tahap = "totp" | "setup";
export type Pending = { u: string; t: Tahap; ingat: boolean; exp: number; s?: string };

function tanda(isi: string): string {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET is missing.");
  return createHmac("sha256", `tally-pending:${rahasia}`).update(isi).digest("base64url");
}

/**
 * Cookie bertanda tangan yang membuktikan langkah pertama (sandi/PIN) lolos.
 * BUKAN sesi: tidak membuka apa pun selain langkah berikutnya, kedaluwarsa
 * 10 menit. `s` = rahasia authenticator baru selama setup, tersandi.
 */
export function bungkusPending(p: Omit<Pending, "exp">, ms = Date.now()): string {
  const isi = Buffer.from(JSON.stringify({ ...p, exp: ms + PENDING_DETIK * 1000 })).toString("base64url");
  return `${isi}.${tanda(isi)}`;
}

export function bukaPending(nilai: string | undefined, ms = Date.now()): Pending | null {
  if (!nilai) return null;
  const [isi, sig] = nilai.split(".");
  if (!isi || !sig) return null;
  const harap = tanda(isi);
  if (sig.length !== harap.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(harap))) return null;
  try {
    const p = JSON.parse(Buffer.from(isi, "base64url").toString("utf8")) as Pending;
    if (typeof p.u !== "string" || (p.t !== "totp" && p.t !== "setup") || typeof p.exp !== "number" || p.exp <= ms) return null;
    return p;
  } catch {
    return null;
  }
}
