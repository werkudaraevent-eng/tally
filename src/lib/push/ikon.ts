/**
 * Ikon dan nama portal di Layar Utama (manifest per acara). Fungsi murni
 * (ikon.check.ts).
 *
 * Ikon dibuat dari nama acara di atas warna merek acara, jadi setiap acara
 * langsung punya ikon yang rapi tanpa panitia mengunggah apa pun. Logo bilah
 * atas tidak dipakai: biasanya lebar dan putih transparan, hilang di ikon
 * persegi.
 */

/** Singkatan 1-3 huruf untuk ikon: "KSO 24 · Fly Beyond Limit" -> "KSO", "Gathering Klasik 2026" -> "GK". */
export function inisialAcara(nama: string): string {
  const kata = nama
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const pertama = kata[0] ?? "";
  // Akronim di depan (KSO, IFC, PRIMA) dipakai utuh bila pendek.
  if (/^\p{Lu}{2,4}$/u.test(pertama)) return pertama;
  const huruf = kata.filter((satu) => /^\p{L}/u.test(satu)).map((satu) => satu[0].toUpperCase());
  return (huruf.slice(0, 2).join("") || pertama.slice(0, 2).toUpperCase() || "T").slice(0, 3);
}

/** Nama pendek di bawah ikon (iOS memotong sekitar 12 huruf): kata utuh sebanyak muat. */
export function namaPendek(nama: string, maks = 12): string {
  const bersih = nama.replace(/\s+/g, " ").trim();
  if (bersih.length <= maks) return bersih;
  let hasil = "";
  for (const satu of bersih.split(" ")) {
    if (!/[\p{L}\p{N}]/u.test(satu)) break;
    const coba = hasil ? `${hasil} ${satu}` : satu;
    if (coba.length > maks) break;
    hasil = coba;
  }
  return hasil || bersih.slice(0, maks);
}

/** Teks putih atau gelap di atas warna latar, menurut kecerahan (WCAG). */
export function warnaTeksDi(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1], 16);
  const kanal = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminans = 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
  // Kontras putih (1.05 / (L + 0.05)) vs gelap ((L + 0.05) / 0.05): yang lebih tinggi.
  return 1.05 / (luminans + 0.05) >= (luminans + 0.05) / 0.05 ? "#ffffff" : "#1b1b1f";
}
