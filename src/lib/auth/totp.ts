import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) untuk masuk admin: kode 6 digit dari aplikasi authenticator
 * (Google Authenticator, Microsoft Authenticator, 1Password, dll). SHA-1,
 * langkah 30 detik, 6 digit: satu-satunya kombinasi yang dibaca semua aplikasi.
 *
 * Ditulis sendiri, bukan pustaka: isinya hanya HMAC + base32, dan pustaka TOTP
 * di npm kebanyakan tidak dirawat.
 */

const ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const LANGKAH_DETIK = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let nilai = 0;
  let out = "";
  for (const byte of buf) {
    nilai = (nilai << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALFABET[(nilai >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABET[(nilai << (5 - bits)) & 31];
  return out;
}

export function base32Decode(teks: string): Buffer {
  const bersih = teks.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let nilai = 0;
  const out: number[] = [];
  for (const huruf of bersih) {
    const i = ALFABET.indexOf(huruf);
    if (i < 0) throw new Error("Invalid base32.");
    nilai = (nilai << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((nilai >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Rahasia baru: 20 byte acak (160 bit, panjang yang dianjurkan RFC 4226). */
export function buatRahasia(): string {
  return base32Encode(randomBytes(20));
}

/** Kode untuk satu langkah waktu. `digit` 8 hanya untuk vektor uji RFC. */
export function kodeUntukLangkah(rahasia: string, langkah: number, digit = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(langkah));
  const hmac = createHmac("sha1", base32Decode(rahasia)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const biner = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(biner % 10 ** digit).padStart(digit, "0");
}

export function langkahSekarang(ms = Date.now()): number {
  return Math.floor(ms / 1000 / LANGKAH_DETIK);
}

/**
 * Cocokkan kode. Menerima satu langkah sebelum dan sesudah (jam HP yang meleset
 * sampai 30 detik). Mengembalikan langkah yang cocok supaya pemanggil bisa
 * menolak kode yang sama dipakai dua kali (OWASP ASVS 2.8.4); null bila tidak
 * cocok atau langkahnya tidak lebih baru dari `langkahTerakhir`.
 */
export function cocokkanKode(rahasia: string, kode: string, opsi: { ms?: number; langkahTerakhir?: number | null } = {}): number | null {
  const bersih = kode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(bersih)) return null;
  const kini = langkahSekarang(opsi.ms);
  for (const langkah of [kini - 1, kini, kini + 1]) {
    if (opsi.langkahTerakhir != null && langkah <= opsi.langkahTerakhir) continue;
    const harap = kodeUntukLangkah(rahasia, langkah);
    if (timingSafeEqual(Buffer.from(harap), Buffer.from(bersih))) return langkah;
  }
  return null;
}

/** Alamat otpauth:// untuk QR. Label "Tally:<username>" tampil di aplikasinya. */
export function alamatOtpauth(rahasia: string, username: string): string {
  const label = encodeURIComponent(`Tally:${username}`);
  return `otpauth://totp/${label}?secret=${rahasia}&issuer=Tally&algorithm=SHA1&digits=6&period=${LANGKAH_DETIK}`;
}
