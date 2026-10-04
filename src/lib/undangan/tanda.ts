import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tanda tangan tamu undangan, dengan rahasia TERSENDIRI (`INVITE_LINK_SECRET`),
 * bukan SESSION_SECRET: membocorkan atau memutar yang satu tidak menyentuh
 * yang lain.
 *
 * Tautan pribadi: `/e/<slug>/daftar?undangan=<id>.<sig>`, dengan
 * sig = base64url(HMAC-SHA256(rahasia, "daftar-undangan:v1:<event>:<id>:<nonce>")).
 * Tidak dipotong, dan dibandingkan dengan timingSafeEqual. Nonce ada di baris
 * undangan: "Buat tautan baru" menggantinya, dan tautan lama langsung mati.
 * Awalan `v1` memberi ruang memutar kunci tanpa mematikan semua tautan.
 *
 * Berkas ini hanya memakai node:crypto, supaya bisa diuji dengan node langsung.
 */

function rahasia(): string {
  const s = process.env.INVITE_LINK_SECRET;
  if (!s || s.length < 32) throw new Error("INVITE_LINK_SECRET is missing or shorter than 32 characters.");
  return s;
}

export function inviteSecretReady(): boolean {
  const s = process.env.INVITE_LINK_SECRET;
  return Boolean(s && s.length >= 32);
}

function hmac(pesan: string) {
  return createHmac("sha256", rahasia()).update(pesan).digest("base64url");
}

function samaPersis(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function inviteLinkToken(eventId: string, invitationId: string, nonce: string): string {
  return `${invitationId}.${hmac(`daftar-undangan:v1:${eventId}:${invitationId}:${nonce}`)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id undangan dari token, tanpa memeriksa tanda tangannya (butuh nonce dari database). */
export function parseInviteToken(token: string | null | undefined): { id: string; sig: string } | null {
  if (!token || token.length > 200) return null;
  const [id, sig, ...sisa] = token.split(".");
  if (sisa.length || !id || !sig || !UUID.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  return { id: id.toLowerCase(), sig };
}

export function verifyInviteToken(token: string, eventId: string, nonce: string): boolean {
  const bagian = parseInviteToken(token);
  if (!bagian) return false;
  return samaPersis(inviteLinkToken(eventId, bagian.id, nonce), `${bagian.id}.${bagian.sig}`);
}

/** Tanda tautan berhenti untuk tamu: `berhenti-undangan:<event>:<invitation>`. */
export function inviteUnsubscribeSignature(eventId: string, invitationId: string): string {
  return hmac(`berhenti-undangan:${eventId}:${invitationId}`);
}

export function verifyInviteUnsubscribe(eventId: string, invitationId: string, sig: string): boolean {
  return samaPersis(inviteUnsubscribeSignature(eventId, invitationId), sig);
}

/**
 * Hash email berpepper untuk penekanan per acara dan batas laju. Tidak bisa
 * dibalik tanpa rahasianya, dan cukup untuk mencocokkan alamat yang sama.
 */
export function emailHash(email: string): string {
  return hmac(`tekan-email:v1:${email}`);
}
