import type { CSSProperties } from "react";
import type { LandingBlockTone, LandingSectionId } from "@/lib/domain";
import { LATAR_BAGIAN_BAWAAN, latarBagian } from "@/lib/landing-section-tone";
import { latarGelapBagian } from "@/lib/registration-theme-css";
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
export function gayaLatarBagian(
  id: LandingSectionId,
  pilihan: Partial<Record<string, LandingBlockTone>> | undefined,
  merek: string | undefined,
): CSSProperties | undefined {
  const nada = latarBagian(id, pilihan);
  if (nada === (LATAR_BAGIAN_BAWAAN[id] ?? "light")) return undefined;
  if (nada === "light") return { backgroundColor: "#ffffff", "--landing-panel": "#ffffff", "--garis-pita": "transparent" } as CSSProperties;
  if (nada === "panel") return { backgroundColor: PANEL_GATHERING, "--landing-panel": PANEL_GATHERING, "--reg-panel": "#ffffff" } as CSSProperties;
  // Merek gelap: gradasi yang sama dengan hero dan pita penutup, dengan biru
  // redup dan alis emasnya. Merek terang: merek yang digelapkan (polos), teks
  // redup dan alis putih 80%, karena emas hero diukur terhadap navy.
  const polos = latarGelapBagian(merek);
  const redup = polos ? "rgb(255 255 255 / 0.8)" : "var(--hero-redup, rgb(255 255 255 / 0.8))";
  return {
    background: polos ?? LATAR_HERO,
    color: "#ffffff",
    "--landing-panel": "transparent",
    "--garis-pita": "transparent",
    "--reg-on-surface": "#ffffff",
    "--reg-on-surface-variant": redup,
    // Garis tab dan kartu: 3:1 terhadap latar (WCAG 1.4.11), QA #115 L4.
    "--reg-outline-variant": "rgb(255 255 255 / 0.5)",
    "--garis-kartu": "rgb(255 255 255 / 0.5)",
    "--reg-panel": "rgb(255 255 255 / 0.08)",
    "--alis": polos ? redup : "var(--hero-alis, rgb(255 255 255 / 0.8))",
    "--primer-teks": "#ffffff",
    "--teks-pita": redup,
    // Inisial pembicara tanpa foto (speaker-tabs.tsx), QA #115 M1.
    // Bingkai foto punya variabel sendiri: --reg-outline-variant di sini putih
    // 50% (garis 3:1) dan akan menjadi lempeng terang di belakang inisial.
    // Inisial putih penuh di atas putih 12%: 5,5:1 ke atas (QA #115 R2).
    "--bingkai-foto": "rgb(255 255 255 / 0.12)",
    "--inisial-latar": "transparent",
    "--inisial-teks": "#ffffff",
    "--inisial-opasitas": "1",
    "--reg-primary": "#ffffff",
    // Tanda ==warna== di Details: putih tebal di atas latar gelap.
    "--warna-tanda": "#ffffff",
    "--reg-on-primary": "#181d27",
    "--aksi": "#ffffff",
    "--on-aksi": "#181d27",
    "--m3-state-color": "#ffffff",
  } as CSSProperties;
}
