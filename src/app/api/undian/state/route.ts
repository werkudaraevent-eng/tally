import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, normalizeBranding } from "@/lib/branding";
import type { UndianState, UndianWinner } from "@/lib/undian";

// State undian untuk layar panggung. PUBLIK — proyektor berjalan tanpa login.
//
// -------------------------------------------------------------------------
// KERAHASIAAN PEMENANG
// -------------------------------------------------------------------------
// `winners` HANYA terisi setelah now() >= reveal_at. Selama animasi berjalan,
// kolom `pending` di database sudah berisi jawabannya, tetapi ia tidak ikut ke
// response ini dalam bentuk apa pun.
//
// Ini bukan kehati-hatian berlebihan. Panitia membuka halaman ini di laptop
// masing-masing selama acara; response yang memuat pemenang lebih awal terlihat
// utuh di tab Network, dan penyaringan di sisi browser tidak menyembunyikan apa
// pun dari orang yang membuka DevTools. Aturan yang sama berlaku di
// /api/display/reveal.
//
// `roster` boleh dikirim penuh: ia berisi SELURUH kolam dalam urutan acak dan
// tidak menunjukkan siapa pemenangnya. Justru itu gunanya — nama-nama itulah yang
// berputar di roda.

export const dynamic = "force-dynamic";

const STATE_ROW = "mode,active_prize_id,phase,draw_round,spin_started_at,reveal_at,pending,pool,pool_size,updated_at";
const SETTINGS_ROW =
  `page_title,page_subtitle,name_display,show_company,show_seat,sound_enabled,confetti_enabled,` +
  `reveal_delay_seconds,background_color,text_color,accent_color,background_image_url,${BRANDING_COLUMNS}`;
const PRIZE_ROW = "id,name,description,image_url,sponsor_name,animation,spin_seconds,winners_per_draw,winner_quota";

type PendingWinner = {
  ref: string;
  kind: "participant" | "entry";
  name: string;
  company: string | null;
  seat: string | null;
  is_backup: boolean;
  slot_order: number;
};

type StateRow = {
  mode: "off" | "live";
  active_prize_id: number | null;
  phase: "idle" | "spinning" | "revealed";
  draw_round: number;
  spin_started_at: string | null;
  reveal_at: string | null;
  pending: { prize_id: number; draw_round: number; winner_ids?: number[]; winners: PendingWinner[] } | null;
  pool: { name: string; seat: string | null; code: string | null }[] | null;
  pool_size: number;
  updated_at: string;
};

const DEFAULT_SETTINGS = {
  page_title: "Undian Berhadiah",
  page_subtitle: null,
  show_company: true,
  show_seat: true,
  sound_enabled: true,
  confetti_enabled: true,
  background_color: null,
  text_color: null,
  accent_color: null,
  background_image_url: null,
};

export async function GET() {
  const client = getSupabaseServiceClient();
  const [stateResult, settingsResult] = await Promise.all([
    client.from("undian_state").select(STATE_ROW).eq("id", 1).maybeSingle(),
    client.from("undian_settings").select(SETTINGS_ROW).eq("id", 1).maybeSingle(),
  ]);

  const settingsRow = (settingsResult.data ?? {}) as Record<string, unknown>;
  const settings = {
    ...DEFAULT_SETTINGS,
    page_title: (settingsRow.page_title as string) ?? DEFAULT_SETTINGS.page_title,
    page_subtitle: (settingsRow.page_subtitle as string | null) ?? null,
    show_company: settingsRow.show_company !== false,
    show_seat: settingsRow.show_seat !== false,
    sound_enabled: settingsRow.sound_enabled !== false,
    confetti_enabled: settingsRow.confetti_enabled !== false,
    background_color: (settingsRow.background_color as string | null) ?? null,
    text_color: (settingsRow.text_color as string | null) ?? null,
    accent_color: (settingsRow.accent_color as string | null) ?? null,
    background_image_url: (settingsRow.background_image_url as string | null) ?? null,
  };
  const branding = normalizeBranding(settingsRow);

  const state = stateResult.data as StateRow | null;

  // Tanpa baris state, atau mode off, layar diam. Ia tidak boleh gagal: bila
  // tabelnya belum termigrasi di suatu lingkungan, halaman tetap menyala dengan
  // brandingnya, bukan menampilkan pesan galat di depan penonton.
  if (!state || state.mode === "off") {
    return Response.json({
      mode: "off", phase: "idle", draw_round: 0, prize: null, roster: [], pool_size: 0,
      spin_started_at: null, reveal_at: null, winners: [], confirmed: [],
      settings, branding, updated_at: new Date().toISOString(),
    } satisfies UndianState & { branding: unknown });
  }

  let prize: UndianState["prize"] = null;
  if (state.active_prize_id) {
    const { data } = await client.from("undian_prizes").select(PRIZE_ROW).eq("id", state.active_prize_id).maybeSingle();
    if (data) {
      const row = data as Record<string, unknown>;
      prize = {
        id: Number(row.id),
        name: String(row.name),
        description: (row.description as string | null) ?? null,
        image_url: (row.image_url as string | null) ?? null,
        sponsor_name: (row.sponsor_name as string | null) ?? null,
        animation: row.animation as UndianState["prize"] extends null ? never : NonNullable<UndianState["prize"]>["animation"],
        spin_seconds: Number(row.spin_seconds),
        winners_per_draw: Number(row.winners_per_draw),
        winner_quota: Number(row.winner_quota),
      };
    }
  }

  // ---------------------------------------------------------------------
  // Penjaga waktu. Satu-satunya tempat yang memutuskan boleh atau tidaknya
  // pemenang dikirim.
  //
  // Perbandingan dilakukan terhadap jam SERVER. Jam komputer panggung tidak dapat
  // dipercaya — ia sering laptop pinjaman dengan zona waktu yang belum disetel —
  // dan membiarkan klien memutuskan sendiri berarti klien yang jamnya maju lima
  // menit menampilkan pemenang sebelum rodanya berhenti berputar.
  // ---------------------------------------------------------------------
  const now = Date.now();
  const revealDue = state.reveal_at !== null && new Date(state.reveal_at).getTime() <= now;
  const phase: UndianState["phase"] = state.phase === "spinning" && revealDue ? "revealed" : state.phase;

  let winners: UndianWinner[] = [];
  if (phase === "revealed" && state.pending) {
    // Baris pemenang diambil lewat ID, bukan lewat (prize_id, draw_round).
    //
    // `draw_round` BUKAN penanda unik. Ia tersimpan di baris singleton
    // `undian_state` dan tidak direset oleh "bersihkan tampilan" maupun penutupan
    // sesi, sehingga undian pertama sesi malam juga bernomor 1 — sama dengan
    // undian pertama sesi siang. Mengambil berdasarkan nomor ronde memunculkan
    // KEDUA rombongan sekaligus, dan hadiah berkuota 10 tampil dengan 20 kartu di
    // depan penonton.
    //
    // Status per pemenang tetap diambil dari tabel, bukan dari `pending`, supaya
    // pembatalan oleh operator langsung terlihat di layar tanpa menunggu undian
    // berikutnya.
    const ids = state.pending.winner_ids ?? [];
    let query = client
      .from("undian_winners")
      .select("id,participant_id,entry_id,display_name,company,seat_label,is_backup,slot_order,status");
    query = ids.length > 0
      ? query.in("id", ids)
      // Cadangan untuk `pending` yang ditulis sebelum `winner_ids` ada. Dibatasi
      // ke undian TERAKHIR pada ronde itu supaya tetap satu rombongan: bila dua
      // sesi memakai nomor ronde yang sama, yang tampil adalah yang baru diundi,
      // bukan gabungan keduanya.
      : query
        .eq("prize_id", state.pending.prize_id)
        .eq("draw_round", state.pending.draw_round)
        .order("id", { ascending: false })
        .limit(state.pending.winners.length);
    const { data: rows } = await query;

    type WinnerRow = {
      id: number; participant_id: string | null; entry_id: number | null;
      display_name: string; company: string | null; seat_label: string | null;
      is_backup: boolean; slot_order: number; status: "pending" | "confirmed" | "rejected";
    };

    winners = ((rows ?? []) as WinnerRow[])
      // Urutan ditegakkan di sini, bukan lewat `.order()`: cabang cadangan sudah
      // memakai order lain untuk mengambil undian terakhir.
      .sort((a, b) => Number(a.is_backup) - Number(b.is_backup) || a.slot_order - b.slot_order)
      .map((row) => ({
        id: row.id,
        ref: row.participant_id ?? String(row.entry_id ?? ""),
        kind: row.participant_id ? "participant" : "entry",
        name: row.display_name,
        company: settings.show_company ? row.company : null,
        seat: settings.show_seat ? row.seat_label : null,
        is_backup: row.is_backup,
        slot_order: row.slot_order,
        status: row.status,
      }));
  }

  // Rekap pemenang hadiah aktif yang sudah disahkan, untuk papan di sisi layar.
  // Hanya yang `confirmed`: yang masih pending belum tentu ada di tempat, dan
  // menampilkannya sebagai pemenang tetap akan salah bila ternyata dibatalkan.
  let confirmed: UndianWinner[] = [];
  if (state.active_prize_id) {
    const { data: rows } = await client
      .from("undian_winners")
      .select("id,display_name,company,seat_label,is_backup,slot_order,draw_round")
      .eq("prize_id", state.active_prize_id)
      .eq("status", "confirmed")
      .order("draw_round")
      .order("slot_order");
    type ConfirmedRow = { id: number; display_name: string; company: string | null; seat_label: string | null; is_backup: boolean; slot_order: number };
    confirmed = ((rows ?? []) as ConfirmedRow[]).map((row) => ({
      id: row.id,
      ref: String(row.id),
      kind: "participant" as const,
      name: row.display_name,
      company: settings.show_company ? row.company : null,
      seat: settings.show_seat ? row.seat_label : null,
      is_backup: row.is_backup,
      slot_order: row.slot_order,
      status: "confirmed" as const,
    }));
  }

  return Response.json({
    mode: state.mode,
    phase,
    draw_round: state.draw_round,
    prize,
    roster: state.pool ?? [],
    pool_size: state.pool_size,
    spin_started_at: state.spin_started_at,
    reveal_at: state.reveal_at,
    winners,
    confirmed,
    settings,
    branding,
    updated_at: new Date().toISOString(),
  });
}
