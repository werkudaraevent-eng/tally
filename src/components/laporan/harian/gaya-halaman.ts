/**
 * Ukuran dan gaya bersama halaman highlight 1080×1920 (halaman.tsx dan
 * halaman-temuan.tsx). Gaya inline saja: next/og tidak mengenal kelas CSS.
 */
import type { CSSProperties } from "react";
import type { WarnaHalaman } from "@/lib/laporan/harian/warna";

export const LEBAR = 1080;
export const TINGGI = 1920;
export const TEPI = 104;

export type Huruf = { judul: string; isi: string };
export const kolom = (gaya: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "column", ...gaya });
export const judul = (h: Huruf, w: WarnaHalaman, ukuran = 104): CSSProperties => ({ fontFamily: h.judul, fontSize: ukuran, lineHeight: 1.04, fontWeight: 800, letterSpacing: -3, color: w.teks, margin: 0, wordBreak: "break-word" });
export const isi = (h: Huruf, w: WarnaHalaman): CSSProperties => ({ fontFamily: h.isi, fontSize: 44, lineHeight: 1.32, fontWeight: 500, color: w.teks2, margin: 0, wordBreak: "break-word" });
/** Area di bawah kepala (top 72) sampai tepi bawah, isinya di tengah. */
export const tengah = (gap: number): CSSProperties => kolom({ flex: 1, justifyContent: "center", padding: `170px ${TEPI}px`, gap });
