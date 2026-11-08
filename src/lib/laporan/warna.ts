/**
 * Warna deck: satu aksen dari tema acara, sisanya abu-abu. Sama untuk HTML,
 * cetak dan PPTX. Aksen yang terlalu terang untuk teks putih di sampul
 * digelapkan sampai kontrasnya cukup (WCAG 4.5:1).
 */
export const WARNA_TETAP = { tinta: "#16181D", tinta2: "#646A79", garis: "#E3E6EB", konteks: "#CDD2DB", masalah: "#B3261E", kertas: "#FFFFFF" } as const;

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: [number, number, number]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const terang = ([r, g, b]: [number, number, number]) => {
  const k = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
};

/** Campur warna `a` ke `b` sebanyak `t` (0..1). */
function campur(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function warnaDeck(aksen: string): { aksen: string; aksen2: string } {
  let c = rgb(aksen) ?? [29, 63, 143];
  // Teks putih di atas aksen: gelapkan bertahap sampai kontras >= 4.5.
  for (let i = 0; i < 12 && 1.05 / (terang(c) + 0.05) < 4.5; i++) c = campur(c, [0, 0, 0], 0.15);
  return { aksen: hex(c), aksen2: hex(campur(c, [255, 255, 255], 0.55)) };
}
