import type { LandingLang } from "../landing-i18n.ts";
import { rentangAcara, type JadwalHitungMundur } from "../landing-hitung-mundur.ts";
import { timeZoneOffset, type EventTimeZone } from "../timezone.ts";

/**
 * Foto dan video acara di portal peserta (diminta Hanung 2026-11-10).
 *
 * Panitia menaruh link album (biasanya folder Google Drive) di Participant
 * area > Event photos and videos: satu link untuk seluruh acara, satu per hari
 * Agenda, atau satu per baris Agenda. Peserta yang sudah masuk melihat kartu
 * "Foto dan video acara" di Beranda begitu hari atau sesinya selesai. Tally
 * hanya menyimpan link, bukan fotonya.
 *
 * Hari dan sesi dibaca dari Agenda, jadi tidak ada daftar kedua yang bisa
 * menyimpang. Link per sesi hanya tampil ke peserta yang bisa melihat baris
 * itu (Who sees it), karena daftar Agenda yang masuk ke sini sudah disaring.
 *
 * Bawaan mati: acara yang tidak menyalakannya berubah 0 px.
 */

export const MODE_DOKUMENTASI = ["event", "day", "session"] as const;
export type ModeDokumentasi = (typeof MODE_DOKUMENTASI)[number];

export const URL_DOKUMENTASI_MAX = 600;
/** Batas jumlah link per mode, pengaman terhadap simpanan yang tidak wajar. */
export const HARI_DOKUMENTASI_MAX = 60;
export const SESI_DOKUMENTASI_MAX = 400;

/** Hanya https, tanpa spasi, kutip, kurung sudut atau garis miring terbalik. */
export const POLA_URL_DOKUMENTASI = /^https:\/\/[^\s"'<>\\]+\.[^\s"'<>\\]+$/i;

export type SetelanDokumentasi = {
  enabled: boolean;
  mode: ModeDokumentasi;
  /** Mode `event`. */
  url?: string | null;
  /** Mode `day`: id bagian Agenda (rundown_sections.id) -> link. */
  days?: Record<string, string> | null;
  /** Mode `session`: id baris Agenda (rundown_items.id) -> link. */
  sessions?: Record<string, string> | null;
};

/** Bagian Agenda seperti yang dibaca portal (AgendaPreview), hanya kolom yang dipakai di sini. */
export type BagianDokumentasi = {
  id?: number;
  sectionTitle: string | null;
  tanggal: string | null;
  items: Array<{ id: number; time: string; end: string | null; title: string; jeda: boolean }>;
};

export type AlbumDokumentasi = {
  kunci: string;
  url: string;
  /** Mode `day` dan `session`: tanggal bagian "YYYY-MM-DD", bila ada. */
  tanggal: string | null;
  /** Mode `day`: label bagian dari Agenda. Mode `session`: judul baris. */
  judul: string | null;
  jenis: ModeDokumentasi;
};

function urlSah(nilai: unknown): string | null {
  if (typeof nilai !== "string") return null;
  const isi = nilai.trim();
  return isi && isi.length <= URL_DOKUMENTASI_MAX && POLA_URL_DOKUMENTASI.test(isi) ? isi : null;
}

/** Setelan apa pun dari `landing_config.member.photos` (portal tidak memeriksa skema) menjadi bentuk yang aman. */
export function bacaSetelanDokumentasi(nilai: unknown): SetelanDokumentasi | null {
  if (!nilai || typeof nilai !== "object") return null;
  const isi = nilai as Record<string, unknown>;
  if (isi.enabled !== true) return null;
  const mode = MODE_DOKUMENTASI.includes(isi.mode as ModeDokumentasi) ? (isi.mode as ModeDokumentasi) : "event";
  const peta = (sumber: unknown) => {
    if (!sumber || typeof sumber !== "object") return {};
    const hasil: Record<string, string> = {};
    for (const [kunci, url] of Object.entries(sumber as Record<string, unknown>)) {
      const sah = urlSah(url);
      if (/^\d{1,12}$/.test(kunci) && sah) hasil[kunci] = sah;
    }
    return hasil;
  };
  return { enabled: true, mode, url: urlSah(isi.url), days: peta(isi.days), sessions: peta(isi.sessions) };
}

const JAM = /^(\d{1,2})[.:](\d{2})/;

/** "05.00" atau "05:00" menjadi menit sejak tengah malam; selain itu null. */
function menit(jam: string | null | undefined): number | null {
  const cocok = jam ? JAM.exec(jam.trim()) : null;
  if (!cocok) return null;
  const nilai = Number(cocok[1]) * 60 + Number(cocok[2]);
  return nilai >= 0 && nilai < 24 * 60 ? nilai : null;
}

function epoch(tanggal: string, menitHari: number, zona: EventTimeZone): number {
  return Date.parse(`${tanggal}T00:00:00${timeZoneOffset(zona)}`) + menitHari * 60_000;
}

/**
 * Kapan satu baris selesai (ms epoch): jam selesai, atau jam mulai bila tanpa
 * jam selesai. Jam selesai sebelum jam mulai = lewat tengah malam. Null bila
 * bagiannya tanpa tanggal atau jamnya rusak.
 */
export function selesaiBaris(tanggal: string | null, item: { time: string; end: string | null }, zona: EventTimeZone): number | null {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const mulai = menit(item.time);
  if (mulai === null) return null;
  const akhir = menit(item.end);
  const total = akhir === null ? mulai : akhir < mulai ? akhir + 24 * 60 : akhir;
  return epoch(tanggal, total, zona);
}

/**
 * Kapan satu hari Agenda selesai: baris yang paling akhir selesai. Hari tanpa
 * baris berjam selesai di ujung tanggalnya. Null bila bagiannya tanpa tanggal.
 */
export function selesaiHari(bagian: BagianDokumentasi, zona: EventTimeZone): number | null {
  if (!bagian.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(bagian.tanggal)) return null;
  const waktu = bagian.items.map((item) => selesaiBaris(bagian.tanggal, item, zona)).filter((nilai): nilai is number => nilai !== null);
  return waktu.length ? Math.max(...waktu) : epoch(bagian.tanggal, 24 * 60, zona);
}

/**
 * Album yang sudah boleh dibuka peserta pada `sekarang`, dalam urutan Agenda.
 * - `event`: setelah acara selesai (tanggal dan jam selesai acara). Acara
 *   tanpa tanggal: langsung, karena tidak ada waktu yang bisa ditunggu.
 * - `day`: setelah hari itu selesai; bagian tanpa tanggal ikut selesainya acara.
 * - `session`: setelah baris itu selesai; hanya baris yang ada di `agenda`
 *   (sudah disaring Who sees it dan Published).
 */
export function albumTerbuka(setelan: SetelanDokumentasi | null, agenda: readonly BagianDokumentasi[], jadwal: JadwalHitungMundur, sekarang: number): AlbumDokumentasi[] {
  if (!setelan?.enabled) return [];
  const zona = jadwal.time_zone;
  const akhirAcara = rentangAcara(jadwal)?.selesai ?? null;
  const sudah = (waktu: number | null) => (waktu === null ? akhirAcara === null || sekarang >= akhirAcara : sekarang >= waktu);

  if (setelan.mode === "event") {
    return setelan.url && sudah(akhirAcara) ? [{ kunci: "acara", url: setelan.url, tanggal: null, judul: null, jenis: "event" }] : [];
  }
  if (setelan.mode === "day") {
    const hasil: AlbumDokumentasi[] = [];
    for (const bagian of agenda) {
      const url = bagian.id !== undefined ? setelan.days?.[String(bagian.id)] : undefined;
      if (!url || !sudah(selesaiHari(bagian, zona))) continue;
      hasil.push({ kunci: `hari-${bagian.id}`, url, tanggal: bagian.tanggal, judul: bagian.sectionTitle?.trim() || null, jenis: "day" });
    }
    return hasil;
  }
  const hasil: AlbumDokumentasi[] = [];
  for (const bagian of agenda) {
    for (const item of bagian.items) {
      const url = setelan.sessions?.[String(item.id)];
      if (!url) continue;
      const selesai = bagian.tanggal ? selesaiBaris(bagian.tanggal, item, zona) : null;
      if (!sudah(selesai)) continue;
      hasil.push({ kunci: `sesi-${item.id}`, url, tanggal: bagian.tanggal, judul: item.title.trim() || null, jenis: "session" });
    }
  }
  return hasil;
}

/** Link per sesi yang sudah terbuka, dikunci id baris: untuk tautan di Susunan acara. */
export function tautanSesiTerbuka(album: readonly AlbumDokumentasi[]): Map<number, string> {
  return new Map(album.filter((item) => item.jenis === "session").map((item) => [Number(item.kunci.slice(5)), item.url]));
}

/** Nama layanan dari alamatnya ("Google Drive"), supaya peserta tahu ke mana link membawa. */
export function layananTautan(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "drive.google.com" || host === "docs.google.com") return "Google Drive";
  if (host === "photos.google.com" || host === "photos.app.goo.gl") return "Google Photos";
  if (host.endsWith("dropbox.com")) return "Dropbox";
  if (host === "1drv.ms" || host.endsWith("onedrive.live.com") || host.endsWith("sharepoint.com")) return "OneDrive";
  if (host === "icloud.com" || host.endsWith(".icloud.com")) return "iCloud";
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "YouTube";
  if (host === "flickr.com" || host.endsWith(".flickr.com")) return "Flickr";
  return host;
}

export const DOKUMENTASI_UI: Record<LandingLang, {
  judul: string;
  jumlah: (n: number) => string;
  semua: string;
  sesi: string;
  tabBaru: string;
}> = {
  id: {
    judul: "Foto dan video acara",
    jumlah: (n) => `${n} album`,
    semua: "Semua foto dan video",
    sesi: "Foto dan video",
    tabBaru: "dibuka di tab baru",
  },
  en: {
    judul: "Event photos and videos",
    jumlah: (n) => (n === 1 ? "1 album" : `${n} albums`),
    semua: "All photos and videos",
    sesi: "Photos and videos",
    tabBaru: "opens in a new tab",
  },
};
