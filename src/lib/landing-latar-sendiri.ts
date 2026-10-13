/**
 * Latar warna sendiri untuk blok dan bagian halaman acara (Background ›
 * Custom). Admin bebas memilih warna; teks dipilih otomatis (putih atau tinta,
 * mana yang lebih kontras), sama seperti latar sendiri blok Hitung mundur, jadi
 * warna apa pun tetap terbaca. CMS memakai fungsi yang sama untuk peringatannya.
 *
 * Bebas impor server-only: dipakai editor dan halaman publik.
 */

import { mixHex } from "./color.ts";
import { kontras, KONTRAS_TEKS_MIN, TINTA } from "./landing-hitung-mundur.ts";

const PUTIH = "#FFFFFF";
const HITAM = "#000000";
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Warna awal saat admin pertama memilih Custom: merek acara, atau navy bila merek tidak terbaca. */
export const LATAR_SENDIRI_AWAL = "#1B2D57";

export function hexLatarSendiri(nilai: string | null | undefined): string | null {
  return nilai && HEX.test(nilai) ? nilai.toUpperCase() : null;
}

export type WarnaLatarSendiri = {
  latar: string;
  /** Teks utama: putih, tinta, atau hitam. 4,5:1 ke atas di latar dan di isi kartu. */
  teks: string;
  /** Teks redup (keterangan, label kecil): 4,5:1 ke atas di latar dan di isi kartu, atau teks penuh. */
  redup: string;
  /** Isi kartu di atas latar (kartu poin, FAQ, kartu kecil). */
  kartu: string;
  /** Garis tab dan kartu: 3:1 ke atas terhadap latar (WCAG 1.4.11, QA #115 L4). */
  garisTegas: string;
  /** Teks putih (latar gelap). */
  gelap: boolean;
};

const lolos = (warna: string, latar: string[], min = KONTRAS_TEKS_MIN) => latar.every((l) => kontras(warna, l) >= min);

export function warnaLatarSendiri(hex: string): WarnaLatarSendiri {
  const latar = hexLatarSendiri(hex) ?? LATAR_SENDIRI_AWAL;
  const terbaik = (gelapnya: string) => (kontras(PUTIH, latar) >= kontras(gelapnya, latar) ? PUTIH : gelapnya);
  // Warna tengah: putih dan tinta sama-sama di bawah 4,5:1 (sekitar 3% ruang
  // warna). Putih atau hitam selalu 4,58:1 ke atas, jadi admin tidak perlu diperingatkan.
  const biasa = terbaik(TINTA);
  const teks = kontras(biasa, latar) >= KONTRAS_TEKS_MIN ? biasa : terbaik(HITAM);
  const gelap = teks === PUTIH;
  const alfa = gelap ? 0.08 : 0.05;
  // Isi kartu biasanya sedikit ke arah teks (seperti putih 8% di Merek gelap).
  // Di warna tengah itu menurunkan kontras teks di kartu, jadi kartu bergeser
  // menjauhi teks: kontras teks di kartu malah naik.
  const keTeks = mixHex(latar, teks, alfa);
  const menjauh = mixHex(latar, gelap ? HITAM : PUTIH, alfa);
  const campur = mixHex(latar, teks, gelap ? 0.8 : 0.72);
  const kartu = lolos(teks, [keTeks]) && lolos(campur, [latar, keTeks]) ? keTeks : menjauh;
  const redup = lolos(campur, [latar, kartu]) ? campur : teks;
  // Garis 50% ke arah teks, dipertebal sampai 3:1 di warna tengah.
  let garisTegas = teks;
  for (let a = 0.5; a < 1; a += 0.05) {
    const calon = mixHex(latar, teks, a);
    if (kontras(calon, latar) >= 3) {
      garisTegas = calon;
      break;
    }
  }
  return { latar, teks, redup, kartu, garisTegas, gelap };
}

/** Garis tipis (pemisah) dan bingkai di atas latar sendiri: latar dicampur ke arah teks. */
function garis(w: WarnaLatarSendiri, alfa: number) {
  return mixHex(w.latar, w.teks, alfa);
}

/**
 * Variabel untuk blok tambahan (landing-blocks.tsx): sama susunannya dengan
 * latar Merek gelap, tetapi warnanya dari latar sendiri.
 */
export function gayaBlokLatarSendiri(hex: string): Record<string, string> {
  const w = warnaLatarSendiri(hex);
  return {
    backgroundColor: w.latar,
    color: w.teks,
    "--reg-on-surface": w.teks,
    "--reg-on-surface-variant": w.redup,
    "--reg-outline-variant": garis(w, w.gelap ? 0.2 : 0.16),
    "--alis": w.redup,
    "--blok-aksen": w.redup,
    "--blok-tombol": w.teks,
    "--blok-tombol-ink": w.latar,
    "--blok-kartu": w.kartu,
    "--m3-state-color": w.teks,
  };
}

/**
 * Variabel untuk bagian bawaan gaya gathering (latar-bagian.ts): susunan yang
 * sama dengan Merek gelap. Garis tab dan kartu 3:1 terhadap latar.
 */
export function gayaBagianLatarSendiri(hex: string): Record<string, string> {
  const w = warnaLatarSendiri(hex);
  return {
    background: w.latar,
    color: w.teks,
    "--landing-panel": "transparent",
    "--garis-pita": "transparent",
    "--reg-on-surface": w.teks,
    "--reg-on-surface-variant": w.redup,
    "--reg-outline-variant": w.garisTegas,
    "--garis-kartu": w.garisTegas,
    "--reg-panel": w.kartu,
    "--alis": w.redup,
    "--primer-teks": w.teks,
    "--teks-pita": w.redup,
    "--bingkai-foto": garis(w, 0.12),
    "--inisial-latar": "transparent",
    "--inisial-teks": w.teks,
    "--inisial-opasitas": "1",
    "--reg-primary": w.teks,
    "--warna-tanda": w.teks,
    "--reg-on-primary": w.latar,
    "--aksi": w.teks,
    "--on-aksi": w.latar,
    "--m3-state-color": w.teks,
  };
}
