import * as Phosphor from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { ikonBawaan, ikonKartu } from "@/lib/landing-card-icons";

// Gambar ikon kartu Tentang acara dari namanya (lihat landing-card-icons.ts).
// Hanya untuk komponen server: seluruh pustaka Phosphor ikut di sini, jadi
// berkas ini tidak boleh diimpor dari komponen klien (bundel peramban ikut
// membengkak). Halaman publik merender SVG-nya di server tanpa JS ikon.

const pustaka = Phosphor as unknown as Record<string, Icon | undefined>;

function cari(nama: string): Icon | null {
  const ikon = pustaka[nama];
  // Ekspor lain (IconContext, IconBase, SSRBase) bukan ikon.
  return ikon && typeof ikon === "object" && nama !== "IconContext" && !nama.endsWith("Base") ? ikon : null;
}

/** Komponen ikon kartu ke-`index`; nama yang tidak dikenal kembali ke bawaan urutannya. */
export function komponenIkonKartu(kartu: { icon?: string | null }, index: number): Icon {
  return cari(ikonKartu(kartu, index)) ?? cari(ikonBawaan(index)) ?? Phosphor.Users;
}
