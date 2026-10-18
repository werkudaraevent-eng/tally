import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { checkpointState } from "@/lib/undian-checkpoint";
import { loadDaftarCheckpoint, loadSetelanCheckpoint, type BarisCheckpoint, type SetelanCheckpoint } from "@/lib/checkpoint/server";
import {
  invalidateBonusSessions,
  invalidateUnknownSessions,
  isTrulyEmpty,
  matchesConditions,
  normalizeExclusionRule,
  participantToCandidate,
  usesAttendance,
  type Candidate,
  type CheckpointSummary,
  type ParticipantPoolRow,
  type PoolBreakdown,
  type UndianConditionNode,
  type UndianExclusionRule,
  type UndianPrize,
  type WeightConfig,
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

export type AttendanceSessionOption = { id: number; name: string };

/**
 * Baris kolam peserta, dengan check-in dari pemindaian aplikasi ini.
 *
 * RPC `undian_participant_pool` hanya membawa `source_checked_in`, salinan
 * scanner API lama. Acara yang memindai lewat /scan mencatat kehadirannya di
 * `attendance_scans`, sehingga syarat "Sudah check-in" dulu menghasilkan nol
 * pada acara yang jelas sudah ramai check-in. Di sini keduanya digabung, pola
 * yang sama dengan Client view (src/lib/live/data.ts).
 *
 * Pemindaian hanya dibaca bila `withAttendance` benar, yaitu bila ada syarat
 * check-in, jumlah scan, atau checkpoint, atau bobotnya memakai jumlah scan.
 * Tombol undi di panggung tidak perlu membayar bacaan yang tidak dipakai.
 * Checkpoint ikut dihitung di sini karena buktinya sebagian besar pemindaian
 * yang sama.
 */
export async function loadParticipantPool(eventId: string, withAttendance: boolean): Promise<ParticipantPoolRow[] | null> {
  const [pool, scans, checkpoint] = await Promise.all([
    poolRows(eventId),
    withAttendance ? attendedSessions(eventId) : Promise.resolve(new Map<string, number[]>()),
    withAttendance ? loadCheckpointData(eventId) : Promise.resolve(undefined),
  ]);
  if (!pool || !scans || checkpoint === null) return null;
  return pool.map((row) => {
    const attended = scans.get(row.participant_id) ?? [];
    return {
      ...row,
      checked_in: row.checked_in || attended.length > 0,
      scan_count: row.scan_count + attended.length,
      attended_sessions: attended,
      ...(checkpoint ? checkpointState(checkpoint.setelan, checkpoint.daftar, attended, checkpoint.pickups.get(row.participant_id)) : {}),
    };
  });
}

type CheckpointData = {
  setelan: SetelanCheckpoint;
  daftar: BarisCheckpoint[];
  /** Barang checkpoint yang sudah diserahkan, per peserta. */
  pickups: Map<string, Set<number>>;
};

/**
 * Setelan, daftar, dan penyerahan barang checkpoint. Null bila salah satunya
 * gagal dibaca: kolam ikut gagal, bukan diam-diam menganggap semua orang 0 poin.
 * Fitur yang mati atau tanpa checkpoint menghasilkan daftar kosong.
 */
async function loadCheckpointData(eventId: string): Promise<CheckpointData | null> {
  const [setelan, daftar] = await Promise.all([loadSetelanCheckpoint(eventId), loadDaftarCheckpoint(eventId)]);
  if (!setelan || !daftar) return null;
  if (!setelan.enabled) return { setelan, daftar: [], pickups: new Map() };
  const itemIds = [...new Set(daftar.map((cp) => cp.item_id).filter((id): id is number => id !== null))];
  const pickups = itemIds.length > 0 ? await checkpointPickups(eventId, itemIds) : new Map<string, Set<number>>();
  if (!pickups) return null;
  return { setelan, daftar, pickups };
}

/** Penyerahan barang checkpoint, keyset per id (bacaan berhenti di 1.000 baris). */
async function checkpointPickups(eventId: string, itemIds: number[]): Promise<Map<string, Set<number>> | null> {
  const client = getSupabaseServiceClient();
  const result = new Map<string, Set<number>>();
  const PAGE = 1000;
  let after = 0;
  for (;;) {
    const { data, error } = await client
      .from("item_pickups")
      .select("id,participant_id,item_id")
      .eq("event_id", eventId)
      .in("item_id", itemIds)
      .gt("id", after)
      .order("id")
      .limit(PAGE);
    if (error) return null;
    const rows = (data ?? []) as { id: number; participant_id: string; item_id: number }[];
    for (const row of rows) {
      const set = result.get(row.participant_id) ?? new Set<number>();
      set.add(Number(row.item_id));
      result.set(row.participant_id, set);
    }
    if (rows.length < PAGE) return result;
    after = Number(rows[rows.length - 1].id);
  }
}

/** Ringkasan untuk teks bantuan rule builder. Null bila gagal dibaca. */
export async function loadCheckpointSummary(eventId: string): Promise<CheckpointSummary | null> {
  const [setelan, daftar] = await Promise.all([loadSetelanCheckpoint(eventId), loadDaftarCheckpoint(eventId)]);
  if (!setelan || !daftar) return null;
  return {
    enabled: setelan.enabled,
    points_enabled: setelan.points_enabled,
    goal: setelan.goal?.points ?? null,
    count: setelan.enabled ? daftar.length : 0,
    total_points: setelan.points_enabled ? daftar.reduce((sum, cp) => sum + (cp.points ?? 0), 0) : 0,
  };
}

/**
 * Seluruh baris RPC kolam, per halaman 1.000. PostgREST memotong hasil RPC di
 * 1.000 baris juga; tanpa ini acara 2.500 orang hanya melihat 1.000 pertama,
 * dan "Belum check-in" bisa bernilai nol padahal 150 orang belum datang.
 * Dibaca per participant_id supaya halaman stabil (nama bisa kembar), lalu
 * diurutkan kembali per nama seperti keluaran RPC aslinya.
 */
async function poolRows(eventId: string): Promise<ParticipantPoolRow[] | null> {
  const client = getSupabaseServiceClient();
  const rows: ParticipantPoolRow[] = [];
  const PAGE = 1000;
  // Keyset (participant_id > terakhir), bukan offset: peserta yang ditambah atau
  // dihapus di tengah pembacaan tidak membuat satu orang terbaca dua kali atau
  // terlewat.
  let after: string | null = null;
  for (;;) {
    let query = client
      .rpc("undian_participant_pool" as never, { p_event_id: eventId } as never)
      .order("participant_id")
      .limit(PAGE);
    if (after) query = query.gt("participant_id", after);
    const { data, error } = await query;
    if (error) return null;
    const page = (data ?? []) as ParticipantPoolRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].participant_id;
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Apakah salah satu pohon butuh data pemindaian. */
export function needsAttendance(...trees: UndianConditionNode[]): boolean {
  return trees.some(usesAttendance);
}

/** Bobot "Jumlah scan" dan aturan tiket tambahan berbasis check-in juga membaca pemindaian. */
export function weightNeedsAttendance(weight: Pick<WeightConfig, "weight_mode" | "weight_var" | "bonus_rules">): boolean {
  if (weight.weight_mode === "bonus") {
    return (weight.bonus_rules ?? []).some((rule) => rule.source === "conditions" && usesAttendance(rule.conditions));
  }
  return weight.weight_mode === "formula" && weight.weight_var === "scan_count";
}

/**
 * Sesi kehadiran per peserta. Dibaca per halaman 1.000 baris karena pembacaan
 * tabel berhenti di sana; pindaian ulang (`is_duplicate`) dilewati supaya
 * halamannya tidak bertambah oleh orang yang dipindai dua kali.
 */
async function attendedSessions(eventId: string): Promise<Map<string, number[]> | null> {
  const client = getSupabaseServiceClient();
  const result = new Map<string, number[]>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("attendance_scans")
      .select("id,participant_id,session_id")
      .eq("event_id", eventId)
      .eq("is_duplicate", false)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as { participant_id: string; session_id: number }[];
    for (const row of rows) {
      const list = result.get(row.participant_id) ?? [];
      if (!list.includes(row.session_id)) list.push(row.session_id);
      result.set(row.participant_id, list);
    }
    if (rows.length < PAGE) return result;
  }
}

/**
 * Sesi kehadiran acara, untuk pilihan "di sesi" pada syarat check-in.
 *
 * null bila gagal dibaca, BUKAN daftar kosong: daftar kosong berarti semua sesi
 * yang dipilih di syarat dianggap sudah dihapus, dan syaratnya ikut rusak.
 */
export async function listAttendanceSessions(eventId: string): Promise<AttendanceSessionOption[] | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .select("id,name")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");
  if (error || !data) return null;
  return (data as { id: number; name: string }[]).map((row) => ({ id: Number(row.id), name: row.name }));
}

/**
 * Aturan yang berlaku untuk sebuah hadiah: yang global plus yang khusus hadiah itu.
 *
 * `eventId` WAJIB, bukan opsional. Aturan pengecualian satu event tidak boleh
 * ikut menggugurkan peserta event lain, dan menjadikannya opsional berarti
 * pemanggil yang lupa tetap lolos compile lalu diam-diam memakai aturan yang
 * salah -- kesalahan yang tidak menimbulkan galat, hanya pemenang yang keliru.
 */
export async function activeRulesFor(eventId: string, prizeId: number | null): Promise<UndianExclusionRule[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("undian_exclusion_rules")
    .select("id,name,note,conditions,prize_id,is_active")
    .eq("event_id", eventId)
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
export async function buildPool(eventId: string, prize: UndianPrize): Promise<PoolResult | { error: "POOL_ERROR" }> {
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
      .eq("event_id", eventId)
      .eq("group_id", prize.entry_group_id)
      .eq("is_active", true)
      .order("id");
    if (error) return { error: "POOL_ERROR" };

    const rows = (data ?? []) as EntryRow[];
    const wonEntryIds = await previousWinnerRefs(eventId, prize, "entry");
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

  const [rawRules, sessions] = await Promise.all([activeRulesFor(eventId, prize.id), listAttendanceSessions(eventId)]);
  if (!sessions) return { error: "POOL_ERROR" };
  const known = new Set(sessions.map((session) => session.id));
  const rules = rawRules.map((rule) => ({ ...rule, conditions: invalidateUnknownSessions(rule.conditions, known) }));
  const conditions = invalidateUnknownSessions(prize.conditions, known);
  const weight = { ...prize, bonus_rules: invalidateBonusSessions(prize.bonus_rules, known) };
  const rows = await loadParticipantPool(eventId, weightNeedsAttendance(weight) || needsAttendance(conditions, ...rules.map((rule) => rule.conditions)));
  if (!rows) return { error: "POOL_ERROR" };
  const wonIds = await previousWinnerRefs(eventId, prize, "participant");

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
    if (!matchesConditions(row, conditions)) {
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
    candidates.push(participantToCandidate(row, weight));
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
async function previousWinnerRefs(eventId: string, prize: UndianPrize, kind: "participant" | "entry"): Promise<Set<string>> {
  if (prize.exclude_scope === "none") return new Set();

  const { data, error } = await getSupabaseServiceClient().rpc(
    "undian_blocking_winner_ids" as never,
    { p_prize_id: prize.id, p_scope: prize.exclude_scope, p_event_id: eventId } as never,
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
