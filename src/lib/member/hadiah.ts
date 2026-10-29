import type { LandingLang } from "../landing-i18n.ts";

/**
 * Kartu "Hadiah kamu" di Beranda portal peserta (diminta Hanung 2026-10-29).
 *
 * Pemenang undian melihat hadiahnya sendiri setelah operator menekan Confirm
 * di panel undian. Bukan saat namanya keluar di layar: momen panggung milik MC,
 * dan pemenang yang ditandai tidak hadir lalu diundi ulang tidak boleh sempat
 * membaca "menang" lalu "batal". Baris latihan tidak pernah tampil.
 *
 * Disalakan di Participant area > Lucky draw prize (`member.prize`, bawaan
 * mati). Cara mengambil: catatan per hadiah (Lucky draw > prize > How winners
 * collect it), atau catatan bawaan acara bila kosong.
 */

export const CATATAN_HADIAH_MAX = 400;

export type SetelanHadiah = { enabled?: boolean; note?: string | null; en?: { note?: string | null } | null } | null | undefined;

/** Baris undian_winners yang dibaca untuk kartu (tanpa kolom lain). */
export type BarisMenang = { id: number; prize_id: number; status: string; rehearsal: boolean | null; decided_at: string | null; drawn_at: string };

export type HadiahPeserta = {
  id: number;
  nama: string;
  gambar: string | null;
  sponsor: string | null;
  catatan: string | null;
  /** Waktu dikonfirmasi (atau keluar, untuk baris lama tanpa decided_at). */
  waktu: string;
};

export function kartuHadiahNyala(setelan: SetelanHadiah): boolean {
  return setelan?.enabled === true;
}

/** Hanya yang dikonfirmasi dan bukan latihan, terbaru di atas. */
export function barisTampil<T extends BarisMenang>(baris: readonly T[]): T[] {
  return baris
    .filter((item) => item.status === "confirmed" && item.rehearsal !== true)
    .sort((a, b) => (b.decided_at ?? b.drawn_at).localeCompare(a.decided_at ?? a.drawn_at) || b.id - a.id);
}

function rapi(teks: string | null | undefined): string | null {
  const isi = teks?.trim();
  return isi ? isi : null;
}

/**
 * Catatan per hadiah menang; kosong -> catatan bawaan acara. Halaman English
 * memakai catatan bawaan English bila ada, lalu yang Indonesia. Catatan per
 * hadiah hanya satu bahasa, seperti nama hadiahnya.
 */
export function catatanHadiah(catatanHadiahIni: string | null | undefined, setelan: SetelanHadiah, lang: LandingLang): string | null {
  const sendiri = rapi(catatanHadiahIni);
  if (sendiri) return sendiri;
  if (lang === "en") return rapi(setelan?.en?.note) ?? rapi(setelan?.note);
  return rapi(setelan?.note);
}

export type NadaHadiah = "kamu" | "anda";

export const HADIAH_UI = {
  id: {
    judul: (nada: NadaHadiah) => (nada === "kamu" ? "Hadiah kamu" : "Hadiah Anda"),
    tanda: "Menang",
    dari: (sponsor: string) => `Dari ${sponsor}`,
    caraAmbil: "Cara mengambil",
    bukaQr: "Buka QR saya",
  },
  en: {
    judul: () => "Your prize",
    tanda: "Won",
    dari: (sponsor: string) => `From ${sponsor}`,
    caraAmbil: "How to collect it",
    bukaQr: "Open my QR",
  },
} satisfies Record<LandingLang, Record<string, unknown>>;
