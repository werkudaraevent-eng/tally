import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Data hasil undian per sesi, dipakai bersama layar riwayat dan endpoint export.
//
// Server-only. Satu modul supaya angka di layar dan angka di berkas export selalu
// berasal dari query yang sama — kalau masing-masing menyusunnya sendiri, keduanya
// akan pelan-pelan berbeda dan panitia tidak tahu mana yang benar.

export type WinnerDetail = {
  id: number;
  session_id: number | null;
  session_name: string | null;
  prize_id: number;
  prize_name: string;
  sponsor_name: string | null;
  draw_round: number;
  display_name: string;
  company: string | null;
  seat_label: string | null;
  qr_code: string | null;
  is_backup: boolean;
  slot_order: number;
  status: "pending" | "confirmed" | "rejected";
  reject_reason: string | null;
  drawn_at: string;
  drawn_by_username: string | null;
  decided_at: string | null;
  decided_by_username: string | null;
};

type RawWinner = {
  id: number;
  session_id: number | null;
  prize_id: number;
  draw_round: number;
  display_name: string;
  company: string | null;
  seat_label: string | null;
  is_backup: boolean;
  slot_order: number;
  status: "pending" | "confirmed" | "rejected";
  reject_reason: string | null;
  drawn_at: string;
  decided_at: string | null;
  undian_sessions: { name: string } | null;
  undian_prizes: { name: string; sponsor_name: string | null } | null;
  participants: { qr_code: string } | null;
  drawn_user: { username: string } | null;
  decided_user: { username: string } | null;
};

const WINNER_SELECT =
  "id,session_id,prize_id,draw_round,display_name,company,seat_label,is_backup,slot_order," +
  "status,reject_reason,drawn_at,decided_at," +
  "undian_sessions(name),undian_prizes(name,sponsor_name),participants(qr_code)," +
  "drawn_user:users!undian_winners_drawn_by_fkey(username)," +
  "decided_user:users!undian_winners_decided_by_fkey(username)";

/**
 * Ambil pemenang, opsional disaring per sesi.
 *
 * `sessionId` null berarti SELURUH riwayat, termasuk baris tanpa sesi (diundi
 * sebelum fitur sesi ada). Itu bukan kasus pinggiran: sepuluh baris pertama di
 * database ini memang tidak bersesi, dan menyembunyikannya akan membuat export
 * "semua hasil" berbohong.
 */
export async function loadWinners(sessionId: number | null): Promise<WinnerDetail[]> {
  let query = getSupabaseServiceClient()
    .from("undian_winners")
    .select(WINNER_SELECT)
    .order("drawn_at", { ascending: true })
    .order("is_backup", { ascending: true })
    .order("slot_order", { ascending: true });
  if (sessionId !== null) query = query.eq("session_id", sessionId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as RawWinner[]).map((row) => ({
    id: row.id,
    session_id: row.session_id,
    session_name: row.undian_sessions?.name ?? null,
    prize_id: row.prize_id,
    // Hadiah yang sudah dihapus tetap punya baris pemenang lewat ON DELETE
    // CASCADE... kecuali memang dihapus. Fallback ini menjaga export tetap
    // terbaca bila relasinya hilang karena sebab lain.
    prize_name: row.undian_prizes?.name ?? "(hadiah dihapus)",
    sponsor_name: row.undian_prizes?.sponsor_name ?? null,
    draw_round: row.draw_round,
    display_name: row.display_name,
    company: row.company,
    seat_label: row.seat_label,
    qr_code: row.participants?.qr_code ?? null,
    is_backup: row.is_backup,
    slot_order: row.slot_order,
    status: row.status,
    reject_reason: row.reject_reason,
    drawn_at: row.drawn_at,
    drawn_by_username: row.drawn_user?.username ?? null,
    decided_at: row.decided_at,
    decided_by_username: row.decided_user?.username ?? null,
  }));
}

export type TimelineEvent = {
  at: string;
  kind: "draw" | "confirm" | "reject";
  prize_name: string;
  detail: string;
  actor: string | null;
};

/**
 * Susun kronologi dari baris pemenang.
 *
 * Satu baris pemenang menghasilkan sampai dua peristiwa: saat diundi, dan saat
 * diputuskan. Keduanya dipisah karena jeda di antaranya adalah informasi — itulah
 * lama waktu pemenang dicari di ruangan.
 *
 * Peristiwa "diundi" DIKELOMPOKKAN per putaran, bukan satu baris per pemenang.
 * Sepuluh pemenang yang keluar dari satu kali tekan tombol adalah SATU peristiwa;
 * menuliskannya sepuluh kali dengan detik yang identik membuat kronologinya
 * tampak seperti sepuluh undian terpisah.
 */
export function buildTimeline(winners: WinnerDetail[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Dikelompokkan per (hadiah, sesi, WAKTU UNDI), bukan per nomor ronde.
  //
  // `draw_round` bukan penanda unik: penghitungnya tinggal di baris singleton
  // `undian_state` dan tidak direset saat tampilan dibersihkan atau sesi ditutup,
  // jadi undian pertama sesi malam juga bernomor 1. Mengelompokkan per nomor
  // ronde menggabungkan dua undian berbeda menjadi satu baris kronologi, dan
  // kronologi acara yang menggabungkan dua momen tidak dapat dipertanggungjawabkan.
  //
  // `drawn_at` berasal dari satu perintah insert, jadi identik untuk semua
  // pemenang dari satu tekan tombol dan berbeda antar tekan tombol.
  const draws = new Map<string, WinnerDetail[]>();
  for (const winner of winners) {
    const key = `${winner.prize_id}-${winner.session_id ?? "tanpa-sesi"}-${winner.drawn_at}`;
    const group = draws.get(key);
    if (group) group.push(winner);
    else draws.set(key, [winner]);
  }

  for (const group of draws.values()) {
    const first = group[0];
    const main = group.filter((row) => !row.is_backup);
    const backup = group.filter((row) => row.is_backup);
    events.push({
      at: first.drawn_at,
      kind: "draw",
      prize_name: first.prize_name,
      detail: `Undian ke-${first.draw_round}: ${main.map((row) => row.display_name).join(", ") || "—"}`
        + (backup.length > 0 ? ` (cadangan: ${backup.map((row) => row.display_name).join(", ")})` : ""),
      actor: first.drawn_by_username,
    });
  }

  for (const winner of winners) {
    if (!winner.decided_at || winner.status === "pending") continue;
    events.push({
      at: winner.decided_at,
      kind: winner.status === "confirmed" ? "confirm" : "reject",
      prize_name: winner.prize_name,
      detail: winner.status === "confirmed"
        ? `${winner.display_name} hadir, hadiah diserahkan`
        : `${winner.display_name} dibatalkan${winner.reject_reason ? ` — ${winner.reject_reason}` : ""}`,
      actor: winner.decided_by_username,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export type PrizeRecap = {
  prize_name: string;
  sponsor_name: string | null;
  draws: number;
  total: number;
  confirmed: number;
  pending: number;
  rejected: number;
  backups: number;
  first_draw_at: string | null;
  last_draw_at: string | null;
};

/** Rekap per hadiah: berapa kali diundi dan bagaimana hasil akhirnya. */
export function buildPrizeRecap(winners: WinnerDetail[]): PrizeRecap[] {
  // `draws` dihitung dari waktu undi yang berbeda, bukan dari nomor ronde.
  // Alasannya sama dengan buildTimeline: nomor ronde dapat terpakai ulang lintas
  // sesi, sehingga dua undian nyata akan terhitung sebagai satu.
  const map = new Map<number, PrizeRecap & { rounds: Set<string> }>();

  for (const winner of winners) {
    let entry = map.get(winner.prize_id);
    if (!entry) {
      entry = {
        prize_name: winner.prize_name,
        sponsor_name: winner.sponsor_name,
        draws: 0, total: 0, confirmed: 0, pending: 0, rejected: 0, backups: 0,
        first_draw_at: winner.drawn_at, last_draw_at: winner.drawn_at,
        rounds: new Set<string>(),
      };
      map.set(winner.prize_id, entry);
    }
    entry.rounds.add(`${winner.session_id ?? "tanpa-sesi"}-${winner.drawn_at}`);
    entry.total += 1;
    if (winner.status === "confirmed") entry.confirmed += 1;
    if (winner.status === "pending") entry.pending += 1;
    if (winner.status === "rejected") entry.rejected += 1;
    if (winner.is_backup) entry.backups += 1;
    if (winner.drawn_at < (entry.first_draw_at ?? winner.drawn_at)) entry.first_draw_at = winner.drawn_at;
    if (winner.drawn_at > (entry.last_draw_at ?? winner.drawn_at)) entry.last_draw_at = winner.drawn_at;
  }

  return [...map.values()].map(({ rounds, ...recap }) => ({ ...recap, draws: rounds.size }));
}
