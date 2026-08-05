import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  isTrulyEmpty,
  matchesConditions,
  normalizeExclusionRule,
  participantToCandidate,
  type Candidate,
  type ParticipantPoolRow,
  type PoolBreakdown,
  type UndianExclusionRule,
  type UndianPrize,
} from "@/lib/undian";

// Pembangun kolam undian.
//
// Server-only: mengimpor service client Supabase. Sengaja DIPISAH dari
// src/lib/undian.ts, yang ikut terbawa ke bundel browser dan karena itu harus
// tetap murni.
//
// Satu-satunya jalan menuju kolam. Baik pratinjau di CMS, pembekuan saat undi
// dimulai, maupun pengundian ulang setelah pemenang ditolak, semuanya memanggil
// fungsi yang sama. Kalau masing-masing menyusun kolamnya sendiri, angka yang
// dilihat panitia sebelum acara dan kolam yang benar-benar diundi bisa berbeda
// tanpa ada yang menyadarinya sampai malam itu.
//
// Empat penyaring, dalam urutan ini:
//   1. syarat hadiah         (tidak memenuhi → keluar)
//   2. aturan pengecualian   (memenuhi → keluar; arahnya berlawanan)
//   3. pengecualian per orang
//   4. sudah pernah menang, sesuai exclude_scope
//
// Urutannya penting untuk PELAPORAN, bukan untuk hasil akhir. Peserta yang kena
// dua penyaring sekaligus dihitung pada yang pertama saja, sehingga jumlah seluruh
// kategori selalu tepat sama dengan selisihnya — angka yang tidak pernah
// menjumlahkan orang yang sama dua kali.

export type PoolResult = {
  candidates: Candidate[];
  /** Memenuhi syarat hadiah, sebelum pengecualian apa pun. */
  eligible_count: number;
  /** Tersingkir karena sudah pernah menang. */
  excluded_winners: number;
  total_tickets: number;
  breakdown: PoolBreakdown;
};

type EntryRow = {
  id: number;
  label: string;
  sublabel: string | null;
  code: string | null;
  weight: number;
};

/** Aturan yang berlaku untuk sebuah hadiah: yang global plus yang khusus hadiah itu. */
export async function activeRulesFor(prizeId: number | null): Promise<UndianExclusionRule[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("undian_exclusion_rules")
    .select("id,name,note,conditions,prize_id,is_active")
    .eq("is_active", true)
    .order("id");
  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .map(normalizeExclusionRule)
    // Aturan tanpa syarat dijatuhkan sebagai jaring pengaman kedua. Database
    // sudah menolaknya lewat CHECK, tapi baris lama atau perubahan manual bisa
    // menyelipkannya — dan pohon kosong di sini berarti SELURUH ruangan gugur.
    //
    // Aturan yang syaratnya RUSAK tidak perlu dijatuhkan: normalizeConditions
    // menggantinya dengan penanda yang selalu bernilai salah, sehingga aturannya
    // tidak mengenai siapa pun dan angka nol di layar CMS memberi tahu panitia.
    .filter((rule) => !isTrulyEmpty(rule.conditions))
    .filter((rule) => rule.prize_id === null || rule.prize_id === prizeId);
}

/**
 * Susun kolam untuk sebuah hadiah.
 *
 * `alreadyWonIds` diambil terpisah, bukan dari kolom `already_won` di RPC, karena
 * cakupannya berbeda per hadiah: 'this_prize' hanya melihat kemenangan pada hadiah
 * itu, sedangkan 'all_prizes' melihat semuanya. RPC tidak tahu hadiah mana yang
 * sedang diundi.
 */
export async function buildPool(prize: UndianPrize): Promise<PoolResult | { error: "POOL_ERROR" }> {
  const client = getSupabaseServiceClient();

  if (prize.source === "entries") {
    if (!prize.entry_group_id) {
      return {
        candidates: [], eligible_count: 0, excluded_winners: 0, total_tickets: 0,
        breakdown: emptyBreakdown(),
      };
    }

    const { data, error } = await client
      .from("undian_entries")
      .select("id,label,sublabel,code,weight")
      .eq("group_id", prize.entry_group_id)
      .eq("is_active", true)
      .order("id");
    if (error) return { error: "POOL_ERROR" };

    const rows = (data ?? []) as EntryRow[];
    const wonEntryIds = await previousWinnerRefs(prize, "entry");
    const eligible = rows.map((row): Candidate => ({
      kind: "entry",
      ref: String(row.id),
      name: row.label,
      company: row.sublabel,
      seat: null,
      code: row.code,
      // Bobot per baris entri selalu dipakai apa adanya. Rumus bobot mengandalkan
      // agregat transaksi yang tidak dimiliki entri hasil import.
      tickets: Math.max(1, row.weight),
    }));

    const candidates = eligible.filter((item) => !wonEntryIds.has(item.ref));
    return {
      candidates,
      eligible_count: eligible.length,
      excluded_winners: eligible.length - candidates.length,
      total_tickets: candidates.reduce((sum, item) => sum + item.tickets, 0),
      breakdown: {
        // Aturan pengecualian tidak berlaku pada daftar import: barisnya hanya
        // punya label dan kode, tanpa perusahaan, tipe peserta, atau agregat
        // transaksi yang menjadi dasar sebagian besar aturan.
        total: eligible.length,
        failed_conditions: 0,
        by_rules: 0,
        by_manual: 0,
        by_previous_wins: eligible.length - candidates.length,
        rule_hits: [],
      },
    };
  }

  const [poolResult, rules] = await Promise.all([
    client.rpc("undian_participant_pool" as never),
    activeRulesFor(prize.id),
  ]);
  if (poolResult.error) return { error: "POOL_ERROR" };

  const rows = (poolResult.data ?? []) as ParticipantPoolRow[];
  const wonIds = await previousWinnerRefs(prize, "participant");

  const breakdown: PoolBreakdown = {
    total: rows.length,
    failed_conditions: 0,
    by_rules: 0,
    by_manual: 0,
    by_previous_wins: 0,
    rule_hits: [],
  };
  const hitCount = new Map<number, number>();

  let eligibleCount = 0;
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (!matchesConditions(row, prize.conditions)) {
      breakdown.failed_conditions += 1;
      continue;
    }
    // `eligible_count` tetap berarti "memenuhi syarat hadiah", sama seperti
    // sebelum aturan ada. Nilai itu dipakai layar CMS untuk kalimat "41 dari 249
    // peserta memenuhi syarat", yang menjawab pertanyaan berbeda dari "berapa yang
    // akhirnya diundi".
    eligibleCount += 1;

    const hit = rules.find((rule) => matchesConditions(row, rule.conditions));
    if (hit) {
      breakdown.by_rules += 1;
      hitCount.set(hit.id, (hitCount.get(hit.id) ?? 0) + 1);
      continue;
    }
    if (row.manually_excluded) {
      breakdown.by_manual += 1;
      continue;
    }
    if (wonIds.has(row.participant_id)) {
      breakdown.by_previous_wins += 1;
      continue;
    }
    candidates.push(participantToCandidate(row, prize));
  }

  // Hanya aturan yang benar-benar menyingkirkan seseorang dilaporkan di sini.
  // Aturan dengan nol hasil justru informasi berguna secara terpisah — lihat
  // /api/admin/undian/rules, yang melaporkan semuanya termasuk yang nol supaya
  // salah tulis syarat langsung terlihat.
  breakdown.rule_hits = rules
    .filter((rule) => (hitCount.get(rule.id) ?? 0) > 0)
    .map((rule) => ({ rule_id: rule.id, rule_name: rule.name, count: hitCount.get(rule.id) ?? 0 }));

  return {
    candidates,
    eligible_count: eligibleCount,
    excluded_winners: breakdown.by_previous_wins,
    total_tickets: candidates.reduce((sum, item) => sum + item.tickets, 0),
    breakdown,
  };
}

function emptyBreakdown(): PoolBreakdown {
  return { total: 0, failed_conditions: 0, by_rules: 0, by_manual: 0, by_previous_wins: 0, rule_hits: [] };
}

/**
 * Siapa yang sudah menang dan karena itu tersingkir.
 *
 * Dua aturan menentukan isinya:
 *
 *   1. Pemenang berstatus `rejected` TIDAK masuk. Peserta yang namanya keluar
 *      lalu ternyata tidak ada di tempat harus kembali ke kolam, bukan gugur
 *      selamanya karena kebetulan sedang ke kamar kecil.
 *   2. Pemenang dari sesi yang SUDAH DITUTUP juga tidak masuk. Itulah inti dari
 *      arsip: hasilnya tetap tersimpan dan tetap bisa diekspor, tapi berhenti
 *      menghalangi undian sesi berikutnya.
 *
 * Keduanya dikerjakan di dalam RPC `undian_blocking_winner_ids`, bukan di sini,
 * supaya aturan yang sama berlaku pada setiap pemanggil tanpa perlu diingat
 * ulang — termasuk kelak bila ada jalur lain yang membangun kolam.
 */
async function previousWinnerRefs(prize: UndianPrize, kind: "participant" | "entry"): Promise<Set<string>> {
  if (prize.exclude_scope === "none") return new Set();

  const { data, error } = await getSupabaseServiceClient().rpc(
    "undian_blocking_winner_ids" as never,
    { p_prize_id: prize.id, p_scope: prize.exclude_scope } as never,
  );
  if (error || !data) return new Set();

  const column = kind === "participant" ? "participant_id" : "entry_id";
  const rows = data as Record<string, string | number | null>[];
  return new Set(
    rows
      .map((row) => row[column])
      .filter((value): value is string | number => value !== null && value !== undefined)
      .map(String),
  );
}
