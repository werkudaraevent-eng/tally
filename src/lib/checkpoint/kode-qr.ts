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

/**
 * Kode QR checkpoint tetap untuk dicetak (migrasi 202611020001). Satu kode per
 * sesi dan nomor cetak: "Make a new code" menaikkan nomornya, jadi poster lama
 * berhenti berlaku. Isi HMAC-nya memakai awalan `fixed:`, jadi tidak pernah
 * sama dengan kode jendela 30 detik (yang isinya angka saja).
 */
export function kodeTetap(rahasia: string, eventId: string, sesiId: number, versi: number): string {
  return createHmac("sha256", kunci(rahasia)).update(`${eventId}:${sesiId}:fixed:${versi}`).digest("base64url").slice(0, 12);
}

function samaPersis(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Hasil memeriksa kode yang dipindai peserta. `lama`: kode cetak dengan nomor
 * yang sudah diganti panitia (posternya perlu dicetak ulang), dibedakan supaya
 * peserta mendapat kalimat yang benar.
 */
export type HasilKode = "sah" | "lama" | "salah";

export type QrSesi = { mode: "rotating" | "fixed"; version: number; changed_at: string | null };

/** Kolom QR checkpoint sesi; kolom yang belum ada (sebelum migrasi) berarti berganti. */
export function bacaQrSesi(baris: Record<string, unknown> | null | undefined): QrSesi {
  const versi = Number(baris?.checkpoint_qr_version);
  return {
    mode: baris?.checkpoint_qr === "fixed" ? "fixed" : "rotating",
    version: Number.isSafeInteger(versi) && versi >= 1 ? versi : 1,
    changed_at: typeof baris?.checkpoint_qr_changed_at === "string" ? baris.checkpoint_qr_changed_at : null,
  };
}

/**
 * Kode berganti selalu diterima (Show QR di scanner tetap jalan untuk sesi
 * cetak). Kode cetak hanya diterima bila sesinya memakai QR tetap dan nomornya
 * nomor sekarang.
 */
export function periksaKode(rahasia: string, eventId: string, sesiId: number, kode: string, ms: number, qr: QrSesi): HasilKode {
  if (kodeSah(rahasia, eventId, sesiId, kode, ms)) return "sah";
  if (qr.mode === "fixed" && samaPersis(kodeTetap(rahasia, eventId, sesiId, qr.version), kode)) return "sah";
  // Nomor lama: dicari mundur sampai 50 nomor, cukup untuk kalimat yang tepat.
  for (let versi = qr.version - (qr.mode === "fixed" ? 1 : 0); versi >= Math.max(1, qr.version - 50); versi--) {
    if (samaPersis(kodeTetap(rahasia, eventId, sesiId, versi), kode)) return "lama";
  }
  return "salah";
}

export function rahasiaKodeQr(): string {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET is missing.");
  return rahasia;
}
