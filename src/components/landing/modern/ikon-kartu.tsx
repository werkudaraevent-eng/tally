import type { Icon } from "@phosphor-icons/react";
import { Users } from "@phosphor-icons/react/dist/ssr";
import { ikonBawaan, ikonKartu } from "@/lib/landing-card-icons";
import { MUAT_IKON } from "./ikon-ssr";

// Gambar ikon kartu Tentang acara dari namanya (lihat landing-card-icons.ts).
// Hanya untuk komponen server. Setiap ikon dimuat sendiri lewat peta impor
// (ikon-ssr.ts), jadi render hanya memuat ikon yang dipakai, bukan seluruh
// pustaka (QA #115 M5). Halaman publik merender SVG-nya di server tanpa JS ikon.

async function muat(nama: string): Promise<Icon | null> {
  const ambil = Object.hasOwn(MUAT_IKON, nama) ? MUAT_IKON[nama] : undefined;
  return ambil ? ambil().catch(() => null) : null;
}

/** Komponen ikon kartu ke-`index`; nama yang tidak dikenal kembali ke bawaan urutannya. */
export async function komponenIkonKartu(kartu: { icon?: string | null }, index: number): Promise<Icon> {
  return (await muat(ikonKartu(kartu, index))) ?? (await muat(ikonBawaan(index))) ?? Users;
}
