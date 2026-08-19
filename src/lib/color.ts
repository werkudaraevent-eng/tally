// Perhitungan warna untuk layar publik.
//
// Dipakai bersama layar undian dan layar voting. Sebelumnya keduanya punya
// salinan sendiri; begitu salah satunya diperbaiki, dua layar di ruangan yang
// sama akan memakai aturan kontras yang berbeda.
//
// Bebas impor server-only: ikut terbawa ke bundel browser.

export function parseHex(hex: string) {
  const raw = (hex ?? "").replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const value = Number.parseInt(full, 16);
  // Jatuh ke emas bawaan bila nilainya tidak terbaca. Melempar di sini berarti
  // layar panggung kosong hanya karena satu kolom warna salah ketik.
  if (full.length !== 6 || !Number.isFinite(value)) return { r: 245, g: 196, b: 81 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const toHex = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");

/** Campur `hex` menuju `target` sebanyak `amount` (0..1). */
export function mixHex(hex: string, target: string, amount: number) {
  const from = parseHex(hex);
  const to = parseHex(target);
  return `#${toHex(from.r + (to.r - from.r) * amount)}${toHex(from.g + (to.g - from.g) * amount)}${toHex(from.b + (to.b - from.b) * amount)}`;
}

/** Luminans kasar 0..1. Cukup untuk memutuskan gelap atau terang. */
export function luminance(hex: string) {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Hitam atau putih, mana pun yang terbaca di atas `hex`. */
export function readableOn(hex: string) {
  return luminance(hex) > 0.6 ? "#0B1020" : "#FFFFFF";
}
