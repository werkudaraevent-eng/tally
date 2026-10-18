import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode QR checkpoint yang berganti (scan mandiri, migrasi 202610180001).
 *
 * Pola QRIS dinamis: kode dihitung dari rahasia server, acara, sesi, dan
 * jendela 30 detik, jadi tidak ada yang disimpan di database. Kode jendela
 * sekarang dan satu jendela sebelumnya diterima: QR yang baru berganti saat
 * peserta memindai tetap sah, dan foto QR yang dikirim ke grup mati paling
 * lama sekitar satu menit kemudian.
 *
 * 72 bit (12 karakter base64url): menebak kode yang hidup satu menit tidak
 * mungkin, dan QR-nya tetap renggang untuk kamera ponsel murah.
 */

export const PERIODE_DETIK = 30;
const PERIODE_MS = PERIODE_DETIK * 1000;

export function jendela(ms: number): number {
  return Math.floor(ms / PERIODE_MS);
}

/** Akhir jendela tempat `ms` berada (ms epoch): saat kode berikutnya berlaku. */
export function berlakuSampai(ms: number): number {
  return (jendela(ms) + 1) * PERIODE_MS;
}

function kunci(rahasia: string): Buffer {
  // Kunci turunan: kode QR yang terlihat semua orang tidak pernah dihitung
  // langsung dengan rahasia sesi.
  return createHmac("sha256", rahasia).update("tally:checkpoint-qr:v1").digest();
}

export function kodeCheckpoint(rahasia: string, eventId: string, sesiId: number, j: number): string {
  return createHmac("sha256", kunci(rahasia)).update(`${eventId}:${sesiId}:${j}`).digest("base64url").slice(0, 12);
}

export function kodeSah(rahasia: string, eventId: string, sesiId: number, kode: string, ms: number): boolean {
  const masuk = Buffer.from(kode);
  const sekarang = jendela(ms);
  return [sekarang, sekarang - 1].some((j) => {
    const benar = Buffer.from(kodeCheckpoint(rahasia, eventId, sesiId, j));
    return benar.length === masuk.length && timingSafeEqual(benar, masuk);
  });
}

export function rahasiaKodeQr(): string {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET is missing.");
  return rahasia;
}
