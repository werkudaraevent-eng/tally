/**
 * Model dan fitur AI yang ditawarkan halaman /ai. Murni: dibaca server dan
 * klien.
 *
 * Hanya model yang sudah diuji untuk fitur itu yang muncul di pilihan. Bebas
 * memilih penyedia lain tidak ditawarkan: tiap fitur diuji dengan modelnya,
 * dan model yang belum diuji bisa diam-diam salah membaca berkas.
 *
 * Harga per juta token (USD), harga API Anthropic. Biaya di halaman /ai dihitung
 * dari token yang dilaporkan API di setiap panggilan, dengan tabel ini.
 */

export type ModelAi = {
  id: string;
  label: string;
  /** USD per juta token masuk. */
  masuk: number;
  /** USD per juta token keluar. */
  keluar: number;
  catatan: string;
};

export const MODEL_AI: readonly ModelAi[] = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", masuk: 2, keluar: 10, catatan: "Recommended. Reads PDFs, photos and messy spreadsheets well." },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", masuk: 0.1, keluar: 0.5, catatan: "Cheapest. Fine for clean spreadsheets; weaker on photos and scans." },
  { id: "claude-opus-5-5", label: "Opus 5.5", masuk: 4, keluar: 20, catatan: "Most careful, twice the cost of Sonnet. For files Sonnet keeps misreading." },
];

export const MODEL_BAWAAN = "claude-sonnet-5-5";

export const modelAi = (id: string | null | undefined) => MODEL_AI.find((m) => m.id === id) ?? null;

/** Biaya satu panggilan dalam USD, dibulatkan ke 6 desimal (kolom numeric(12,6)). */
export function biayaUsd(modelId: string, tokenMasuk: number, tokenKeluar: number): number {
  const model = modelAi(modelId) ?? modelAi(MODEL_BAWAAN)!;
  const usd = (tokenMasuk * model.masuk + tokenKeluar * model.keluar) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export type FiturAi = {
  key: string;
  label: string;
  uraian: string;
  tempat: string;
  /** false = belum dibangun; tampil "Coming soon" supaya terlihat apa yang menyusul. */
  siap: boolean;
};

export const FITUR_AI: readonly FiturAi[] = [
  { key: "logistik_kamar", label: "Hotel file to room numbers", uraian: "Excel, CSV, PDF, photos of room keys, chat screenshots", tempat: "Logistics › Import", siap: true },
  { key: "ask_ai", label: "Ask AI", uraian: "Where and how questions about Tally, answered from the feature guide", tempat: "Quick search (Ctrl K)", siap: true },
  { key: "peserta_impor", label: "Participant file to list", uraian: "Client lists in any layout", tempat: "Participant list › Import", siap: false },
  { key: "agenda_rundown", label: "Rundown to agenda", uraian: "PDF or Word rundown", tempat: "Agenda", siap: false },
  { key: "pembicara_cv", label: "CV to speaker profile", uraian: "CV or bio", tempat: "Speakers", siap: false },
  { key: "feedback_ringkas", label: "Summary of open answers", uraian: "Feedback answers", tempat: "Feedback", siap: false },
];

export const fiturAi = (key: string) => FITUR_AI.find((f) => f.key === key) ?? null;

export type SetelanAi = {
  adaKunci: boolean;
  kunciAkhir: string | null;
  modelBawaan: string;
  modelFitur: Record<string, string>;
  fiturMati: string[];
  batasBulanan: number;
  kunciDicek: string | null;
};

/** Model yang dipakai satu fitur: pilihan fitur itu bila masih ditawarkan, lalu model bawaan. */
export function modelUntuk(setelan: Pick<SetelanAi, "modelBawaan" | "modelFitur">, fitur: string): string {
  const pilihan = setelan.modelFitur[fitur];
  if (pilihan && modelAi(pilihan)) return pilihan;
  return modelAi(setelan.modelBawaan) ? setelan.modelBawaan : MODEL_BAWAAN;
}

/** Awal bulan UTC dari sebuah waktu, untuk batas bulanan dan ringkasan "This month". */
export function awalBulan(waktu: Date): Date {
  return new Date(Date.UTC(waktu.getUTCFullYear(), waktu.getUTCMonth(), 1));
}
