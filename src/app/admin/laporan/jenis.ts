import type { ConfigLaporan } from "@/lib/laporan/config";
import type { Deck, Slide, SlideAbsen } from "@/lib/laporan/jenis";
import type { PilihanEditor } from "@/lib/laporan/server";
import type { BarisDaftar } from "@/lib/laporan/susun";

/** Jawaban GET /api/admin/laporan. */
export type DataLaporan = {
  siap: true;
  config: ConfigLaporan;
  updated_at: string | null;
  shared_at: string | null;
  deck: Deck;
  daftar: BarisDaftar[];
  absen: SlideAbsen[];
  semua: Record<string, Slide>;
  pilihan: PilihanEditor;
  slug: string;
  /** Akun Viewer acara ini: yang melihat salinan di tab Report. */
  klien: Array<{ username: string; aktif: boolean }>;
};

/** Judul dan catatan yang sedang diketik, supaya pratinjau ikut berubah sebelum disimpan. */
export type Draf = { judul?: string; catatan?: string };
