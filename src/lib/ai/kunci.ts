import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Sandi kunci API AI di database.
 *
 * AES-256-GCM dengan kunci turunan HKDF dari `INVITE_LINK_SECRET`. Rahasia itu
 * dipilih karena tidak pernah dirotasi (merotasinya mematikan setiap tautan
 * undangan yang sudah terkirim), jadi kunci AI tidak hilang diam-diam. Turunan
 * HKDF dengan label tersendiri membuat sandi ini tidak bisa dipakai untuk
 * memalsukan tanda tangan undangan, dan sebaliknya.
 *
 * Database hanya menyimpan sandinya; kunci asli tidak pernah keluar dari
 * server dan tidak pernah dikirim ke peramban.
 */

const VERSI = "v1";

function kunciTurunan(): Buffer {
  const rahasia = process.env.INVITE_LINK_SECRET;
  if (!rahasia || rahasia.length < 32) throw new Error("INVITE_LINK_SECRET is missing or shorter than 32 characters.");
  return Buffer.from(hkdfSync("sha256", rahasia, "tally-ai-settings", "ai-api-key", 32));
}

export function sandikan(kunciApi: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kunciTurunan(), iv);
  const isi = Buffer.concat([cipher.update(kunciApi, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSI, iv.toString("base64url"), tag.toString("base64url"), isi.toString("base64url")].join(".");
}

/** Null bila sandi rusak atau dibuat dengan rahasia lain. */
export function bukaSandi(sandi: string): string | null {
  const [versi, iv, tag, isi] = sandi.split(".");
  if (versi !== VERSI || !iv || !tag || !isi) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", kunciTurunan(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(isi, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
