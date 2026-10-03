import { parseHex } from "@/lib/color";

/** Rasio kontras WCAG 2.x antara dua warna heksadesimal. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const { r, g, b: biru } = parseHex(hex);
    const kanal = (nilai: number) => {
      const c = nilai / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(biru);
  };
  const [terang, gelap] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}
