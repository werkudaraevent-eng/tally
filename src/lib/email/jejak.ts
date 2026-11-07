import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jejak email (Messages): token untuk gambar 1x1 "dibuka" dan halaman baca
 * pengumuman "diklik". Fungsi murni; rahasianya dioper pemanggil
 * (jejak-server.ts memakai SESSION_SECRET).
 *
 * Token = <jenis><id>.<tanda>, jenis "a" baris announcement_email_recipients,
 * "b" baris message_blast_recipients. Tanda = 22 karakter pertama
 * base64url(HMAC-SHA256(rahasia, "jejak-email:v1:<jenis>:<id>")). Tidak
 * disimpan di database; yang memegang token hanya bisa menandai barisnya
 * sendiri dibuka atau diklik, dan membaca pengumuman yang sudah ada di
 * emailnya.
 */

export type JenisJejak = "a" | "b";
export type Jejak = { jenis: JenisJejak; id: number };

const PANJANG_TANDA = 22;

function tanda(rahasia: string, jenis: JenisJejak, id: number) {
  return createHmac("sha256", rahasia).update(`jejak-email:v1:${jenis}:${id}`).digest("base64url").slice(0, PANJANG_TANDA);
}

export function buatToken(rahasia: string, jenis: JenisJejak, id: number): string {
  return `${jenis}${id}.${tanda(rahasia, jenis, id)}`;
}

export function bacaToken(rahasia: string, token: string | null | undefined): Jejak | null {
  const cocok = typeof token === "string" ? /^([ab])([1-9][0-9]{0,15})\.([A-Za-z0-9_-]{22})$/.exec(token) : null;
  if (!cocok) return null;
  const jenis = cocok[1] as JenisJejak;
  const id = Number(cocok[2]);
  if (!Number.isSafeInteger(id)) return null;
  const harapan = Buffer.from(tanda(rahasia, jenis, id));
  const diberikan = Buffer.from(cocok[3]);
  return harapan.length === diberikan.length && timingSafeEqual(harapan, diberikan) ? { jenis, id } : null;
}

/**
 * Pemuatan oleh proxy Apple Mail Privacy Protection: Apple memuat semua gambar
 * email di servernya dengan user agent yang hanya "Mozilla/5.0", entah email
 * itu dibaca atau tidak. Dicatat terpisah ("Opened (Apple, not confirmed)").
 * Proxy Gmail (GoogleImageProxy) memuat gambar saat email dibuka, jadi
 * dihitung dibuka.
 */
export function bukaOtomatis(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua === "" || ua === "Mozilla/5.0";
}

/** GIF transparan 1x1 (43 byte). */
export const GIF_KOSONG = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export { statusEmail, type StatusEmail } from "./jejak-status.ts";
