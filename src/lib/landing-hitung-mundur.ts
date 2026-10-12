/**
 * Blok Hitung mundur di halaman acara: berapa lama lagi menuju hari H.
 *
 * Sasarannya tanggal dan jam mulai acara yang sudah ada (event_date +
 * start_time, di zona waktu acara), bukan isian baru di blok. Tanggal acara
 * sudah dipakai rundown, email, dan kalender; sumber kedua hanya akan menyimpang.
 *
 * Zona Indonesia tidak ber-DST (lihat timezone.ts), jadi offset tetap boleh
 * ditempel ke ISO tanpa library zona waktu.
 */

import { mixHex, parseHex } from "./color.ts";
import type { LandingBlockTone, LandingHighlight } from "./domain.ts";
import { EVENT_TIME_ZONES, type EventTimeZone } from "./timezone.ts";

export type JadwalHitungMundur = {
  event_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  time_zone: EventTimeZone;
};

export type KeadaanHitungMundur =
  | { fase: "menuju"; hari: number; jam: number; menit: number }
  /** Acara sedang berjalan. `hariKe` dihitung dari 1; `lama` = jumlah hari acara. */
  | { fase: "berlangsung"; hariKe: number; lama: number }
  | { fase: "selesai" };

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const JAM = /^(\d{2}):(\d{2})(?::(\d{2}))?/;
const SEHARI = 86_400_000;

function offset(zona: EventTimeZone): string {
  return EVENT_TIME_ZONES.find((z) => z.id === zona)?.offset ?? "+07:00";
}

/** "HH:MM[:SS]" yang sah menjadi "HH:MM:SS"; selain itu null. */
function jamUtuh(nilai: string | null): string | null {
  const cocok = nilai ? JAM.exec(nilai) : null;
  return cocok ? `${cocok[1]}:${cocok[2]}:${cocok[3] ?? "00"}` : null;
}

/**
 * Detik mulai dan selesai acara (ms epoch). Tanpa jam mulai, acara dianggap
 * mulai pukul 00.00; tanpa jam selesai, berakhir di ujung hari terakhir.
 * Null bila tanggal mulai tidak ada atau rusak.
 */
export function rentangAcara(jadwal: JadwalHitungMundur): { mulai: number; selesai: number; hariPertama: string; lama: number } | null {
  const awal = jadwal.event_date;
  if (!awal || !TANGGAL.test(awal)) return null;
  const akhir = jadwal.end_date && TANGGAL.test(jadwal.end_date) && jadwal.end_date >= awal ? jadwal.end_date : awal;
  const zona = offset(jadwal.time_zone);
  const mulai = Date.parse(`${awal}T${jamUtuh(jadwal.start_time) ?? "00:00:00"}${zona}`);
  const jamSelesai = jamUtuh(jadwal.end_time);
  // Jam selesai sebelum jam mulai di acara sehari (data rusak, atau acara lewat
  // tengah malam) tidak boleh membuat acara selesai sebelum mulai.
  const selesaiMentah = jamSelesai ? Date.parse(`${akhir}T${jamSelesai}${zona}`) : Date.parse(`${akhir}T00:00:00${zona}`) + SEHARI;
  const selesai = Math.max(selesaiMentah, mulai + 60_000);
  const lama = Math.round((Date.parse(`${akhir}T00:00:00Z`) - Date.parse(`${awal}T00:00:00Z`)) / SEHARI) + 1;
  return { mulai, selesai, hariPertama: awal, lama };
}

/**
 * Keadaan blok pada saat `sekarang` (ms epoch). Null bila acara tanpa tanggal:
 * blok tidak dirender, sama seperti blok lain yang belum punya isi.
 *
 * Menit dibulatkan ke atas, jadi "0 hari 00 jam 00 menit" tidak pernah tampil
 * sebelum acara benar-benar mulai.
 */
export function keadaanHitungMundur(jadwal: JadwalHitungMundur, sekarang: number): KeadaanHitungMundur | null {
  const rentang = rentangAcara(jadwal);
  if (!rentang) return null;
  if (sekarang >= rentang.selesai) return { fase: "selesai" };
  if (sekarang >= rentang.mulai) {
    // Hari ke berapa menurut kalender di zona acara, bukan per 24 jam sejak mulai.
    const tengahMalamPertama = Date.parse(`${rentang.hariPertama}T00:00:00${offset(jadwal.time_zone)}`);
    const hariKe = Math.min(rentang.lama, Math.floor((sekarang - tengahMalamPertama) / SEHARI) + 1);
    return { fase: "berlangsung", hariKe, lama: rentang.lama };
  }
  const sisaMenit = Math.ceil((rentang.mulai - sekarang) / 60_000);
  return { fase: "menuju", hari: Math.floor(sisaMenit / 1440), jam: Math.floor((sisaMenit % 1440) / 60), menit: sisaMenit % 60 };
}

/** Milidetik sampai angka berikutnya berganti (pergantian menit), paling sedikit 1 detik. */
export function jedaBerikutnya(jadwal: JadwalHitungMundur, sekarang: number): number {
  const rentang = rentangAcara(jadwal);
  if (!rentang) return 60_000;
  const batas = sekarang < rentang.mulai ? rentang.mulai : rentang.selesai;
  const keMenit = (batas - sekarang) % 60_000 || 60_000;
  return Math.max(1_000, keMenit);
}

/** Keadaan saat ini, untuk render server. Render pertama di peramban memakai hasil ini apa adanya. */
export function keadaanSaatIni(jadwal: JadwalHitungMundur): KeadaanHitungMundur | null {
  return keadaanHitungMundur(jadwal, Date.now());
}

/** Waktu server saat render, dikirim ke komponen klien supaya render pertamanya sama persis. */
export function sekarangServer(): number {
  return Date.now();
}

/**
 * Sisa hari menurut kalender di zona acara: 0 = hari H hari ini, 1 = besok.
 * Untuk kalimat ("Besok", "3 hari lagi"); kisi hari/jam/menit tetap memakai
 * waktu yang benar-benar tersisa.
 */
export function sisaHariKalender(jadwal: JadwalHitungMundur, sekarang: number): number {
  const rentang = rentangAcara(jadwal);
  if (!rentang) return 0;
  const [jam, menit] = offset(jadwal.time_zone).slice(1).split(":").map(Number);
  const hariIni = new Date(sekarang + (jam * 60 + menit) * 60_000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(`${rentang.hariPertama}T00:00:00Z`) - Date.parse(`${hariIni}T00:00:00Z`)) / SEHARI));
}

/** Sisa waktu dipecah. Dengan detik: detik dibulatkan ke atas; tanpa detik: menit dibulatkan ke atas. */
export function pecahSisa(ms: number, denganDetik: boolean): { hari: number; jam: number; menit: number; detik: number } {
  if (denganDetik) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return { hari: Math.floor(s / 86400), jam: Math.floor((s % 86400) / 3600), menit: Math.floor((s % 3600) / 60), detik: s % 60 };
  }
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return { hari: Math.floor(m / 1440), jam: Math.floor((m % 1440) / 60), menit: m % 60, detik: 0 };
}

// ---- Warna -----------------------------------------------------------------

/** Rasio kontras WCAG 2.x antara dua warna heksadesimal. */
export function kontras(a: string, b: string): number {
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

export const TINTA = "#0B1020";
const PUTIH = "#FFFFFF";
/** Abu-abu panel halaman acara (--reg-panel), cukup dekat untuk ukur kontras. */
const PANEL = "#F3F4F6";
/** Angka besar (24 px ke atas, tebal) dan grafik boleh 3:1 menurut WCAG; teks biasa 4,5:1. */
export const KONTRAS_SOROT_MIN = 3;
export const KONTRAS_TEKS_MIN = 4.5;
/** Papan keberangkatan gaya Papan, selalu gelap. */
export const LATAR_PAPAN = "#0D1117";

/**
 * Lapisan gelap gaya Foto, dari atas ke bawah. Kontras diukur terhadap dua
 * ujungnya: lapisan teratas di atas foto putih polos (paling terang) dan
 * lapisan terbawah di atas foto hitam (paling gelap). Warna merek yang gelap
 * lolos di ujung terang tetapi hilang di ujung gelap.
 */
const LAPIS_FOTO = { warna: "#080C1A", atas: 0.62, bawah: 0.78 };
export const LAPISAN_FOTO = `linear-gradient(180deg, rgb(8 12 26 / ${LAPIS_FOTO.atas}), rgb(8 12 26 / ${LAPIS_FOTO.bawah}))`;
export const FOTO_PALING_TERANG = mixHex(PUTIH, LAPIS_FOTO.warna, LAPIS_FOTO.atas);
export const FOTO_PALING_GELAP = mixHex("#000000", LAPIS_FOTO.warna, LAPIS_FOTO.bawah);

export type WarnaHitungMundur = {
  /** Latar sendiri (hanya bila bg_color diisi); selain itu latar dari `tone` atau foto. */
  latar: string | null;
  /** Warna teks di atas latar itu. */
  teks: string;
  /** Sorot untuk angka besar dan grafik di latar blok (3:1). */
  sorot: string;
  /** Sorot untuk teks kecil di latar blok, mis. label di atas judul (4,5:1). */
  sorotKecil: string;
  /** Sorot di kartu tiket yang selalu putih (3:1), tinta bila tidak lolos. */
  sorotPutih: string;
  /** Sorot untuk tanggal kecil di papan gelap (4,5:1), putih bila tidak lolos. */
  sorotPapan: string;
  /** Sorot pilihan admin kurang kontras di latar blok dan diganti warna teks. */
  sorotDiganti: boolean;
  /** Sorot pilihan admin kurang kontras di kartu tiket putih dan diganti tinta. */
  putihDiganti: boolean;
};

/**
 * Warna blok Hitung mundur. Teks di atas latar sendiri dipilih otomatis (putih
 * atau tinta, mana yang lebih kontras), dan warna sorot yang kurang kontras
 * terhadap tempatnya diganti warna teks, jadi admin tidak bisa membuat angka
 * yang tidak terbaca. CMS memakai fungsi yang sama untuk peringatannya.
 */
export function warnaHitungMundur(
  blok: { tone?: LandingBlockTone; bg_color?: string; highlight?: LandingHighlight },
  tema: { brand: string; accent: string | null },
  latarFoto = false,
): WarnaHitungMundur {
  const hex = (nilai?: string) => (nilai && /^#[0-9a-fA-F]{6}$/.test(nilai) ? nilai : null);
  const sendiri = latarFoto ? null : hex(blok.bg_color);
  const tone = blok.tone ?? "dark";
  // Latar tempat sorot harus terbaca. Foto: kedua ujung lapisannya.
  const latarUkur = latarFoto ? [FOTO_PALING_TERANG, FOTO_PALING_GELAP] : [sendiri ?? (tone === "dark" ? mixHex(tema.brand, "#000000", 0.55) : tone === "panel" ? PANEL : PUTIH)];
  // Teks di foto selalu putih: lapisannya gelap.
  const teks = latarFoto || kontras(PUTIH, latarUkur[0]) >= kontras(TINTA, latarUkur[0]) ? PUTIH : TINTA;
  const lolos = (warna: string, latar: string | string[], min: number) => [latar].flat().every((l) => kontras(warna, l) >= min);
  // Otomatis: aksen bila ada dan terbaca, lalu merek, lalu cadangan, tanpa peringatan.
  // Pilihan admin: dipakai bila terbaca, selain itu cadangan dengan peringatan.
  const calon = blok.highlight
    ? [blok.highlight === "brand" ? tema.brand : blok.highlight === "accent" ? tema.accent ?? tema.brand : blok.highlight === "ink" ? null : hex(blok.highlight) ?? tema.brand]
    : [tema.accent, tema.brand];
  const tinta = blok.highlight === "ink";
  const pilih = (latar: string | string[], min: number, cadangan: string) =>
    tinta ? cadangan : calon.find((warna): warna is string => Boolean(warna) && lolos(warna!, latar, min)) ?? cadangan;
  const dipilih = Boolean(blok.highlight) && !tinta;
  const sorot = pilih(latarUkur, KONTRAS_SOROT_MIN, teks);
  const sorotPutih = pilih(PUTIH, KONTRAS_SOROT_MIN, TINTA);
  return {
    latar: sendiri,
    teks,
    sorot,
    sorotKecil: lolos(sorot, latarUkur, KONTRAS_TEKS_MIN) ? sorot : teks,
    sorotPutih,
    sorotPapan: pilih(LATAR_PAPAN, KONTRAS_TEKS_MIN, PUTIH),
    sorotDiganti: dipilih && sorot === teks && calon[0] !== teks,
    putihDiganti: dipilih && sorotPutih === TINTA && calon[0] !== TINTA,
  };
}
