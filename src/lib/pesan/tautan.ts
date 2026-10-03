import { createHmac } from "node:crypto";
import { hashToken } from "@/lib/member/account";

/**
 * Token tautan undangan, diturunkan dari rahasia server alih-alih acak.
 *
 * Token mentah tidak pernah disimpan (tabel hanya menyimpan sha256-nya), tetapi
 * mesin perlu menyusun email yang SAMA PERSIS bila sebuah potongan dikirim ulang
 * dengan kunci idempotensi yang sama. Menurunkannya dari (kiriman, peserta)
 * memberi token yang sama di setiap percobaan, di email dan nanti di WhatsApp,
 * tanpa menyimpan apa pun yang bisa dipakai masuk.
 */
export function inviteToken(blastId: string, participantId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing.");
  return createHmac("sha256", secret).update(`undangan:${blastId}:${participantId}`).digest("base64url");
}

export function inviteTokenHash(blastId: string, participantId: string) {
  return hashToken(inviteToken(blastId, participantId));
}

/** Tanda tangan tautan berhenti berlangganan: peserta + acara, tanpa masa kedaluwarsa. */
export function unsubscribeSignature(eventId: string, participantId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing.");
  return createHmac("sha256", secret).update(`berhenti:${eventId}:${participantId}`).digest("base64url").slice(0, 32);
}
