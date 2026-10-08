import type { CSSProperties } from "react";
import type { LandingBlockTone, LandingSectionId } from "@/lib/domain";
import { LATAR_BAGIAN_BAWAAN, latarBagian } from "@/lib/landing-section-tone";
import { LATAR_HERO } from "./gathering-app";

// Latar bagian bawaan gaya gathering (Halaman acara > tiap bagian >
// Background), pilihan yang sama dengan blok: Light, Grey, Dark brand. Isi
// bagian menulis warnanya lewat variabel tema, jadi latar cukup mengganti
// variabelnya di pembungkus; teks, tombol, dan kartu ikut tanpa kelas
// bersyarat di tiap elemen.

/** Abu-abu pita gathering (rancangan pen.dev). */
export const PANEL_GATHERING = "#F4F6F8";

/**
 * Gaya pembungkus selebar layar untuk satu bagian. Undefined bila bagian tetap
 * memakai latar bawaannya, supaya halaman yang tidak diubah tetap sama persis.
 * `--landing-panel` adalah pita yang sudah dilukis Susunan acara dan Pembicara.
 */
export function gayaLatarBagian(id: LandingSectionId, pilihan: Partial<Record<string, LandingBlockTone>> | undefined): CSSProperties | undefined {
  const nada = latarBagian(id, pilihan);
  if (nada === (LATAR_BAGIAN_BAWAAN[id] ?? "light")) return undefined;
  if (nada === "light") return { backgroundColor: "#ffffff", "--landing-panel": "#ffffff", "--garis-pita": "transparent" } as CSSProperties;
  if (nada === "panel") return { backgroundColor: PANEL_GATHERING, "--landing-panel": PANEL_GATHERING, "--reg-panel": "#ffffff" } as CSSProperties;
  return {
    // Gradasi yang sama dengan hero dan pita penutup.
    background: LATAR_HERO,
    color: "#ffffff",
    "--landing-panel": "transparent",
    "--garis-pita": "transparent",
    "--reg-on-surface": "#ffffff",
    "--reg-on-surface-variant": "var(--hero-redup, rgb(255 255 255 / 0.8))",
    "--reg-outline-variant": "rgb(255 255 255 / 0.2)",
    "--reg-panel": "rgb(255 255 255 / 0.08)",
    "--alis": "var(--hero-alis, rgb(255 255 255 / 0.8))",
    "--primer-teks": "#ffffff",
    "--teks-pita": "var(--hero-redup, rgb(255 255 255 / 0.8))",
    "--reg-primary": "#ffffff",
    "--reg-on-primary": "#181d27",
    "--aksi": "#ffffff",
    "--on-aksi": "#181d27",
    "--m3-state-color": "#ffffff",
  } as CSSProperties;
}
