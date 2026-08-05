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

/**
 * Bentuk baris seperti yang dikirim ke layar, di mana `total_spent` DAPAT TIDAK
 * ADA.
 *
 * Sengaja dibedakan dari `LeaderboardEntry`: yang itu mewakili keluaran RPC dan
 * di sana nominal selalu ada. Dengan `display_settings.show_amount = false`,
 * `/api/display/reveal` menghapus kolom itu dari response supaya nominal tidak
 * terbaca dari tab Network pada endpoint yang terbuka tanpa login.
 *
 * Dipisah supaya TypeScript memaksa layar menangani ketidakhadirannya. Kalau
 * `total_spent` dibiarkan wajib, `formatRupiah(undefined)` akan lolos kompilasi
 * dan muncul sebagai "Rp NaN" di proyektor.
 */
export type PublicLeaderboardEntry = Omit<LeaderboardEntry, "total_spent"> & { total_spent?: number };

/**
 * Buang `total_spent` bila `display_settings.show_amount` = false.
 *
 * WAJIB dipakai oleh SETIAP endpoint papan yang dapat diakses tanpa login.
 * Menyembunyikan angka lewat CSS tidak cukup: response-nya terbaca siapa pun
 * lewat tab Network, dan itu tepat angka yang klien minta untuk tidak
 * ditampilkan. Alasannya sama dengan pemotongan papan per tahap di
 * `/api/display/reveal`, yang juga dikerjakan di server dan bukan di browser.
 *
 * Dikerjakan saat MENYUSUN response, bukan saat menulis `leaderboard_reveal.
 * snapshot`. Kalau nominal dibuang sebelum dibekukan, mengembalikan toggle ke
 * true tidak akan bisa memulihkan angkanya dan reveal harus dimulai ulang.
 *
 * Urutan tetap benar tanpa nominal: `rank` dihitung `get_leaderboard` di server,
 * layar tidak pernah menyortir sendiri.
 *
 * Fungsi murni dan ada di modul ini supaya satu implementasi dipakai bersama.
 * Tiga endpoint publik menyalin logika yang sama adalah tiga tempat yang harus
 * diingat saat aturannya berubah, dan yang terlupa tidak akan gagal build —
 * hanya membocorkan angka.
 */
export function redactAmounts<T extends { total_spent?: number }>(entries: T[], showAmount: boolean): Array<Omit<T, "total_spent">> {
  if (showAmount) return entries;
  return entries.map(({ total_spent, ...rest }) => {
    void total_spent;
    return rest;
  });
}

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
  entries: PublicLeaderboardEntry[];
};
