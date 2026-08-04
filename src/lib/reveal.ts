// Bentuk data dan aturan tahap reveal leaderboard.
//
// Dipakai bersama oleh route handler, halaman operator, dan layar display, jadi
// modul ini WAJIB bebas dari impor server-only (mis. service client Supabase):
// ia ikut terbawa ke bundel browser.
//
// Semua penjepitan tahap ada di sini, satu tempat. Kalau tersebar, batas atas
// tahap akan dihitung ulang di tiga berkas dan cukup satu yang salah untuk
// membuat layar kosong di tengah ceremony.

export type RevealMode = "off" | "staged";
export type StageLayout = "spotlight" | "list";

/**
 * Satu tahap = satu RENTANG peringkat, bukan batas atas kumulatif.
 *
 * Klien memilih pola spotlight: tahap 1 menampilkan peringkat 1-3, lalu tahap 2
 * MENGGANTIKANNYA dengan 4-10. Batas kumulatif tunggal tidak bisa menyatakan
 * "mulai dari 4". Dengan rentang, pola kumulatif tetap bisa dinyatakan juga
 * (1-3 lalu 1-10) tanpa perubahan kode.
 */
export type RevealStage = { from: number; to: number; label: string; layout: StageLayout };

export const REVEAL_ACTIONS = ["config", "start", "next", "prev", "show_all", "reset"] as const;
export type RevealAction = (typeof REVEAL_ACTIONS)[number];

/** Harus sama dengan default kolom `stages` di migrasi. */
export const DEFAULT_REVEAL_STAGES: RevealStage[] = [
  { from: 1, to: 3, label: "Peringkat 1-3", layout: "spotlight" },
  { from: 4, to: 10, label: "Peringkat 4-10", layout: "list" },
];

/**
 * Bentuk `stages` datang dari kolom jsonb, jadi tipenya tidak dijamin apa pun.
 * Baris yang rusak dijatuhkan, dan bila tidak ada yang tersisa dipakai nilai
 * bawaan — layar tidak boleh kosong hanya karena satu entri salah bentuk.
 */
export function normalizeStages(value: unknown): RevealStage[] {
  if (!Array.isArray(value)) return DEFAULT_REVEAL_STAGES;
  const stages = value.flatMap((item): RevealStage[] => {
    if (typeof item !== "object" || item === null) return [];
    const raw = item as Record<string, unknown>;
    const from = Number(raw.from);
    const to = Number(raw.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) return [];
    const layout: StageLayout = raw.layout === "spotlight" ? "spotlight" : "list";
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : `Peringkat ${from}-${to}`;
    return [{ from: Math.trunc(from), to: Math.trunc(to), label, layout }];
  });
  return stages.length > 0 ? stages : DEFAULT_REVEAL_STAGES;
}

/**
 * Jepit nomor tahap ke 0..count+1.
 *
 * Batas atasnya count+1, bukan count: nomor terakhir dipakai tombol "Tampilkan
 * semua" untuk papan penuh. Menyimpannya sebagai tahap tambahan, bukan kolom
 * boolean terpisah, membuat mustahil ada keadaan yang bertentangan (tahap 1
 * sekaligus tampilkan-semua) yang setiap pembaca harus tafsirkan sendiri.
 */
export function clampStage(stage: number, count: number): number {
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(count + 1, Math.trunc(stage)));
}

/** Nomor tahap semu untuk papan penuh. */
export const showAllStage = (count: number) => count + 1;

/**
 * Rentang peringkat yang tampil pada sebuah tahap, atau null bila belum ada.
 *
 * `limit` adalah kedalaman papan (display_settings.leaderboard_limit) dan hanya
 * dipakai tahap papan penuh.
 */
export function visibleRange(
  stage: number,
  stages: RevealStage[],
  limit: number,
): { from: number; to: number; label: string; layout: StageLayout } | null {
  if (stage <= 0) return null;
  if (stage > stages.length) return { from: 1, to: limit, label: "Papan penuh", layout: "list" };
  const current = stages[stage - 1];
  return { from: current.from, to: current.to, label: current.label, layout: current.layout };
}

/** Satu baris leaderboard, sama dengan keluaran RPC `get_leaderboard`. */
export type LeaderboardEntry = {
  rank: number;
  display_name: string;
  company: string | null;
  total_spent: number;
  booth_count: number;
};

/** Bentuk response GET /api/display/reveal. */
export type RevealState = {
  mode: RevealMode;
  leaderboard_enabled: boolean;
  stage: number;
  stage_count: number;
  stage_label: string | null;
  layout: StageLayout;
  from: number;
  frozen: boolean;
  frozen_at?: string | null;
  updated_at: string;
  entries: LeaderboardEntry[];
};
