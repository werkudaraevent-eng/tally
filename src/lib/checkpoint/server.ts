import { cache } from "react";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { LandingLang } from "@/lib/landing-i18n";
import { bacaTujuan, tujuanPeserta, type TujuanPeserta, type TujuanPoin } from "@/lib/checkpoint/tujuan";
import { pilihWaktu, type WaktuLangkah } from "@/lib/checkpoint/waktu";
import { loadAgendaPreview, type PenontonAgenda } from "@/lib/landing-agenda";
import { bacaTautanAgenda } from "@/lib/sasaran-blok";

/**
 * Checkpoint peserta (migrasi 202610140002): daftar langkah berurutan yang
 * dilihat peserta, tiap langkah menunjuk SATU bukti yang sudah dicatat
 * aplikasi, yaitu pemindaian di satu sesi (`attendance_scans`) atau satu barang
 * yang diserahkan (`item_pickups`). Tidak ada catatan selesai tersendiri.
 *
 * Semua pembaca di sini tidak melempar: sakelar mati, galat, atau database yang
 * belum dimigrasi menghasilkan null, dan halaman tampil seperti sebelumnya.
 */

export type BarisCheckpoint = {
  id: number;
  title: string;
  title_en: string | null;
  place: string | null;
  place_en: string | null;
  session_id: number | null;
  item_id: number | null;
  points: number | null;
  sort_order: number;
  /** Siapa yang memindai (migrasi 202610180001). Sebelum migrasinya: selalu staff. */
  completion: Penyelesaian;
  /** Baris Agenda yang memberi tanggal dan jam (migrasi 202610220001). Kosong: tanpa tanggal. */
  agenda_item_ids: number[];
  /** Pesan di layar hasil scan mandiri (migrasi 202610290002). Null: tanpa pesan. */
  scan_message: string | null;
  scan_message_en: string | null;
};

/** staff: panitia memindai QR peserta. self: peserta memindai QR checkpoint. both: keduanya. */
export type Penyelesaian = "staff" | "self" | "both";

/** Nilai kolom `completion`; kolom yang belum ada atau nilai asing berarti staff. */
export function bacaPenyelesaian(nilai: unknown): Penyelesaian {
  return nilai === "self" || nilai === "both" ? nilai : "staff";
}

/**
 * Sesi yang boleh dipindai sendiri oleh peserta, dari daftar checkpoint.
 * Beberapa checkpoint di satu sesi: kemajuan dihitung per sesi, jadi satu
 * checkpoint Staff membuat seluruh sesi dipindai panitia; kalau tidak, scan
 * mandiri ikut menyelesaikan checkpoint Staff itu. Di antara self dan both, `both`
 * menang, karena panitia tetap boleh memindai di sana.
 */
export function scanMandiriPerSesi(daftar: Pick<BarisCheckpoint, "session_id" | "completion">[]): Map<number, "self" | "both"> {
  const hasil = new Map<number, "self" | "both">();
  const staff = new Set<number>();
  for (const cp of daftar) {
    if (cp.session_id === null) continue;
    if (cp.completion === "staff") staff.add(cp.session_id);
    else if (hasil.get(cp.session_id) !== "both") hasil.set(cp.session_id, cp.completion);
  }
  for (const sesi of staff) hasil.delete(sesi);
  return hasil;
}

export type SetelanCheckpoint = { enabled: boolean; points_enabled: boolean; goal: TujuanPoin | null };

export const loadSetelanCheckpoint = cache(async (eventId: string): Promise<SetelanCheckpoint | null> => {
  try {
    // select *, bukan daftar kolom: sebelum migrasi 202610170001 kolom tujuan
    // belum ada, dan menyebutnya membuat seluruh setelan gagal dibaca (kartu
    // checkpoint dan catatan di layar scan hilang). Tanpa kolomnya = tanpa tujuan.
    const { data, error } = await getSupabaseServiceClient()
      .from("checkpoint_settings")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) return null;
    const baris = data as Record<string, unknown> | null;
    return { enabled: baris?.enabled === true, points_enabled: baris?.points_enabled === true, goal: bacaTujuan(baris) };
  } catch {
    return null;
  }
});

/** Teks kolom opsional: kolom yang belum ada, kosong, atau bukan teks berarti null. */
function teksAtauNull(nilai: unknown): string | null {
  return typeof nilai === "string" && nilai.trim() ? nilai.trim() : null;
}

export const loadDaftarCheckpoint = cache(async (eventId: string): Promise<BarisCheckpoint[] | null> => {
  try {
    // select *: kolom `completion` baru ada setelah migrasi 202610180001, dan
    // menyebutnya sebelum itu membuat kartu checkpoint hilang.
    const { data, error } = await getSupabaseServiceClient()
      .from("checkpoints")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error || !Array.isArray(data)) return null;
    return (data as Record<string, unknown>[]).map((baris) => ({
      id: baris.id as number,
      title: baris.title as string,
      title_en: (baris.title_en as string | null) ?? null,
      place: (baris.place as string | null) ?? null,
      place_en: (baris.place_en as string | null) ?? null,
      session_id: (baris.session_id as number | null) ?? null,
      item_id: (baris.item_id as number | null) ?? null,
      points: (baris.points as number | null) ?? null,
      sort_order: baris.sort_order as number,
      completion: bacaPenyelesaian(baris.completion),
      agenda_item_ids: bacaTautanAgenda(baris.agenda_item_ids),
      scan_message: teksAtauNull(baris.scan_message),
      scan_message_en: teksAtauNull(baris.scan_message_en),
    }));
  } catch {
    return null;
  }
});

/**
 * Kapan peserta ini menyelesaikan tiap checkpoint: pemindaian PERTAMA di sesinya
 * atau jam barangnya diserahkan. Kunci = id checkpoint.
 *
 * Dua kueri yang disaring ke satu peserta dan ke sesi/barang checkpoint saja,
 * jadi barisnya sedikit (satu orang dipindai beberapa kali per sesi). Ukuran
 * barang ikut, supaya peserta melihat kaos ukuran berapa yang ia bawa.
 */
async function selesaiPeserta(
  eventId: string,
  participantId: string,
  daftar: BarisCheckpoint[],
): Promise<Map<number, { at: string; size: string | null }> | null> {
  const sesiIds = [...new Set(daftar.map((cp) => cp.session_id).filter((id): id is number => id !== null))];
  const barangIds = [...new Set(daftar.map((cp) => cp.item_id).filter((id): id is number => id !== null))];
  const db = getSupabaseServiceClient();
  const [scans, pickups] = await Promise.all([
    sesiIds.length > 0
      ? db.from("attendance_scans").select("session_id,scanned_at").eq("event_id", eventId).eq("participant_id", participantId).in("session_id", sesiIds).order("scanned_at", { ascending: true }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    barangIds.length > 0
      ? db.from("item_pickups").select("item_id,picked_up_at,size").eq("event_id", eventId).eq("participant_id", participantId).in("item_id", barangIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scans.error || pickups.error) return null;
  const pertamaSesi = new Map<number, string>();
  for (const scan of (scans.data ?? []) as { session_id: number; scanned_at: string }[]) {
    if (!pertamaSesi.has(scan.session_id)) pertamaSesi.set(scan.session_id, scan.scanned_at);
  }
  const barang = new Map<number, { at: string; size: string | null }>();
  for (const pickup of (pickups.data ?? []) as { item_id: number; picked_up_at: string; size: string | null }[]) {
    barang.set(pickup.item_id, { at: pickup.picked_up_at, size: pickup.size?.trim() || null });
  }
  const hasil = new Map<number, { at: string; size: string | null }>();
  for (const cp of daftar) {
    const bukti = cp.session_id !== null ? (pertamaSesi.has(cp.session_id) ? { at: pertamaSesi.get(cp.session_id)!, size: null } : null) : barang.get(cp.item_id!) ?? null;
    if (bukti) hasil.set(cp.id, bukti);
  }
  return hasil;
}

/**
 * Setelan dan daftar dibaca bersamaan (satu putaran, bukan dua). Null bila fitur
 * mati, daftar kosong, atau galat.
 */
async function muatAktif(eventId: string): Promise<{ setelan: SetelanCheckpoint; daftar: BarisCheckpoint[] } | null> {
  const [setelan, daftar] = await Promise.all([loadSetelanCheckpoint(eventId), loadDaftarCheckpoint(eventId)]);
  if (!setelan?.enabled || !daftar || daftar.length === 0) return null;
  return { setelan, daftar };
}

/**
 * Untuk layar QR kehadiran Horizon: setelan checkpoint, dan apakah ada
 * checkpoint yang boleh dipindai peserta sendiri. Bila ada, layar QR memberi
 * tombol "Pindai QR checkpoint" (pola QRIS: tunjukkan kode atau pindai).
 */
export async function loadCheckpointQr(eventId: string): Promise<{ setelan: SetelanCheckpoint | null; pindai: boolean }> {
  const [setelan, daftar] = await Promise.all([loadSetelanCheckpoint(eventId), loadDaftarCheckpoint(eventId)]);
  return { setelan, pindai: Boolean(setelan?.enabled && daftar && scanMandiriPerSesi(daftar).size > 0) };
}

/** Satu checkpoint seperti yang dilihat peserta, dalam bahasa halamannya. */
export type LangkahPeserta = {
  id: number;
  title: string;
  place: string | null;
  points: number | null;
  done_at: string | null;
  size: string | null;
  /**
   * Peserta boleh memindai QR checkpoint ini sendiri. `self`: tombol utamanya
   * memindai saja; `both`: juga "Tunjukkan QR-mu ke panitia". Null: panitia.
   */
  self_scan: "self" | "both" | null;
  /** Sesi buktinya (null: barang). Hanya untuk mencocokkan hasil scan mandiri. */
  session_id: number | null;
  /** Tanggal dan jam dari baris Agenda yang boleh dilihat peserta ini. Null: tanpa tanggal. */
  when: WaktuLangkah | null;
};

export type CheckpointPeserta = {
  /** Nama barang yang sudah menjadi checkpoint: kartu "Barang yang disiapkan" tidak mengulangnya. */
  item_names: string[];
  points: boolean;
  steps: LangkahPeserta[];
  done: number;
  earned: number;
  total_points: number;
  /** Baris tujuan poin (E-08). Null: kartu tanpa baris itu. */
  goal: TujuanPeserta | null;
  /** Angka tujuan poin bila `goal` ada: layar hasil scan tahu scan mana yang melewatinya. */
  goal_target: number | null;
};

/**
 * Tanggal dan jam baris Agenda yang boleh dilihat peserta ini, per id baris.
 * Dibaca lewat loadAgendaPreview, pembaca yang sama dengan Jadwal peserta:
 * hanya bagian dan baris yang tayang, dan baris bersyarat (Who sees it) hanya
 * bila syaratnya cocok. Agenda hanya dibaca bila ada checkpoint bertanggal,
 * jadi acara lain tidak membaca apa pun. Gagal dibaca: tanpa tanggal.
 */
async function waktuAgenda(daftar: BarisCheckpoint[], lang: LandingLang, penonton: PenontonAgenda | undefined): Promise<Map<number, WaktuLangkah>> {
  const peta = new Map<number, WaktuLangkah>();
  if (!penonton || !daftar.some((cp) => cp.agenda_item_ids.length > 0)) return peta;
  const agenda = await loadAgendaPreview(penonton.acara.id, lang, penonton).catch(() => []);
  for (const bagian of agenda) {
    if (!bagian.tanggal) continue;
    for (const item of bagian.items) peta.set(item.id, { date: bagian.tanggal, start: item.time, end: item.end });
  }
  return peta;
}

/**
 * Kartu Checkpoint di Dashboard saya. Null bila fitur mati, belum ada
 * checkpoint, atau ada galat: kartunya tidak tampil sama sekali.
 *
 * `penonton` (peserta ini dan acaranya) memberi tiap langkah tanggalnya dari
 * Agenda. Tanpanya (jawaban scan mandiri) langkah tanpa tanggal.
 */
export async function loadCheckpointPeserta(eventId: string, participantId: string, lang: LandingLang, penonton?: PenontonAgenda): Promise<CheckpointPeserta | null> {
  try {
    const aktif = await muatAktif(eventId);
    if (!aktif) return null;
    const { setelan, daftar } = aktif;
    const barangIds = daftar.map((cp) => cp.item_id).filter((id): id is number => id !== null);
    const [selesai, barang, terlihat] = await Promise.all([
      selesaiPeserta(eventId, participantId, daftar),
      barangIds.length > 0
        ? getSupabaseServiceClient().from("pickup_items").select("name").eq("event_id", eventId).in("id", barangIds)
        : Promise.resolve({ data: [], error: null }),
      waktuAgenda(daftar, lang, penonton),
    ]);
    if (!selesai) return null;
    const en = lang === "en";
    const mandiri = scanMandiriPerSesi(daftar);
    const steps = daftar.map((cp) => ({
      id: cp.id,
      title: (en && cp.title_en?.trim()) || cp.title,
      place: ((en && cp.place_en?.trim()) || cp.place?.trim()) || null,
      points: setelan.points_enabled ? cp.points ?? 0 : null,
      done_at: selesai.get(cp.id)?.at ?? null,
      size: selesai.get(cp.id)?.size ?? null,
      self_scan: cp.session_id !== null ? mandiri.get(cp.session_id) ?? null : null,
      session_id: cp.session_id,
      when: pilihWaktu(cp.agenda_item_ids, terlihat),
    }));
    const earned = steps.reduce((jumlah, step) => jumlah + (step.done_at ? step.points ?? 0 : 0), 0);
    const total_points = steps.reduce((jumlah, step) => jumlah + (step.points ?? 0), 0);
    const goal = tujuanPeserta(setelan, { earned, total: total_points }, lang);
    return {
      item_names: barang.error ? [] : ((barang.data ?? []) as { name: string }[]).map((item) => item.name),
      points: setelan.points_enabled,
      steps,
      done: steps.filter((step) => step.done_at).length,
      earned,
      total_points,
      goal,
      goal_target: goal ? setelan.goal?.points ?? null : null,
    };
  } catch {
    return null;
  }
}

/**
 * Catatan checkpoint di lembar hasil layar pemindai, sesudah pemindaian di
 * `sessionId` atau penyerahan `itemIds`.
 *
 * `selesai`: checkpoint yang buktinya ada di pemindaian/penyerahan ini.
 * `terbuka_sebelum`: checkpoint SEBELUM yang terakhir selesai di sini yang
 * belum dikerjakan, supaya petugas bisa mengarahkan peserta. Urutan tidak
 * pernah menolak siapa pun.
 */
export type CatatanCheckpointScan = {
  total: number;
  done: number;
  points: boolean;
  selesai: { posisi: number; judul: string; poin: number | null }[];
  terbuka_sebelum: { posisi: number; judul: string }[];
};

export async function catatanCheckpointScan(
  eventId: string,
  participantId: string,
  bukti: { sessionId?: number; itemIds?: number[] },
): Promise<CatatanCheckpointScan | null> {
  try {
    const aktif = await muatAktif(eventId);
    if (!aktif) return null;
    const { setelan, daftar } = aktif;
    const kena = daftar
      .map((cp, index) => ({ cp, posisi: index + 1 }))
      .filter(({ cp }) => (bukti.sessionId !== undefined && cp.session_id === bukti.sessionId) || (cp.item_id !== null && (bukti.itemIds ?? []).includes(cp.item_id)));
    if (kena.length === 0) return null;
    const selesai = await selesaiPeserta(eventId, participantId, daftar);
    if (!selesai) return null;
    const terakhir = Math.max(...kena.map((k) => k.posisi));
    return {
      total: daftar.length,
      done: daftar.filter((cp) => selesai.has(cp.id)).length,
      points: setelan.points_enabled,
      // Teks petugas: judul utama acara (petugas bukan pembaca halaman EN).
      selesai: kena.map(({ cp, posisi }) => ({ posisi, judul: cp.title, poin: setelan.points_enabled ? cp.points ?? 0 : null })),
      terbuka_sebelum: daftar
        .slice(0, terakhir - 1)
        .map((cp, index) => ({ cp, posisi: index + 1 }))
        .filter(({ cp }) => !selesai.has(cp.id))
        .map(({ cp, posisi }) => ({ posisi, judul: cp.title })),
    };
  } catch {
    return null;
  }
}
