import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getPublicRequestEvent, requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_REVEAL_STAGES,
  REVEAL_ACTIONS,
  clampStage,
  normalizeStages,
  redactAmounts,
  showAllStage,
  visibleRange,
  type LeaderboardEntry,
  type RevealMode,
} from "@/lib/reveal";

/**
 * Reveal bertahap leaderboard.
 *
 * GET publik (layar proyektor berjalan tanpa operator yang login), POST hanya
 * admin.
 *
 * Aturan paling penting di berkas ini: GET HANYA MENGEMBALIKAN PERINGKAT YANG
 * SEDANG TAMPIL. Peringkat yang belum diumumkan tidak boleh ikut di response
 * lalu dipotong di browser — panitia yang membuka /display di laptopnya sendiri
 * akan melihat pemenang di tab Network sebelum MC menyebutnya. Pemotongan
 * karenanya dikerjakan di server, dan efek sampingnya menguntungkan: payload
 * kecil, sehingga polling 2 detik tetap murah.
 */

const ROW = "mode,stage,stages,freeze_on_start,snapshot,frozen_at,updated_at";

type RevealRow = {
  mode: RevealMode;
  stage: number;
  stages: unknown;
  freeze_on_start: boolean;
  snapshot: LeaderboardEntry[] | null;
  frozen_at: string | null;
  updated_at: string;
};

/** Ambil papan live dari RPC yang sama dengan /api/leaderboard. */
async function liveEntries(limit: number, eventId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("get_leaderboard" as never, { p_limit: limit, p_event_id: eventId } as never);
  if (error) return { error };
  return { entries: (data ?? []) as LeaderboardEntry[] };
}

export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("INTERNAL_ERROR", 404);
  const eventId = event.id;
  const client = getSupabaseServiceClient();
  // `leaderboard_limit` tetap milik display_settings: ia menentukan sedalam apa
  // papan diambil, baik saat mode off maupun saat tahap terakhir dibuka.
  const [revealResult, displayResult, eventResult] = await Promise.all([
    client.from("leaderboard_reveal").select(ROW).eq("event_id", eventId).maybeSingle(),
    client.from("display_settings").select("leaderboard_limit,show_amount").eq("event_id", eventId).maybeSingle(),
    client.from("event_settings").select("leaderboard_enabled").eq("event_id", eventId).maybeSingle(),
  ]);

  const displayRow = displayResult.data as { leaderboard_limit?: number; show_amount?: boolean } | null;
  const limit = displayRow?.leaderboard_limit ?? 10;
  // `!== false`, bukan truthiness: selama baris konfigurasi belum terbaca nominal
  // dianggap tetap tampil, sama seperti default kolomnya. Gagal baca tidak boleh
  // mengubah tampilan yang sedang berjalan di panggung.
  const showAmount = displayRow?.show_amount !== false;
  const enabled = (eventResult.data as { leaderboard_enabled?: boolean } | null)?.leaderboard_enabled ?? true;
  const row = revealResult.data as RevealRow | null;
  const stages = normalizeStages(row?.stages ?? DEFAULT_REVEAL_STAGES);

  // Tanpa baris reveal (atau mode off) jawabannya sama dengan perilaku lama:
  // seluruh top N, live. Ini juga jaring pengaman bila tabelnya belum termigrasi
  // di suatu lingkungan — layar tetap menyala, bukan blank.
  if (!row || row.mode === "off") {
    const live = await liveEntries(limit, eventId);
    if (live.error) return apiError(mapDatabaseError(live.error), 500);
    return Response.json({
      mode: "off" as const,
      leaderboard_enabled: enabled,
      stage: 0,
      stage_count: stages.length,
      stage_label: null,
      layout: "list" as const,
      from: 1,
      frozen: false,
      stages,
      freeze_on_start: row?.freeze_on_start ?? true,
      frozen_at: row?.frozen_at ?? null,
      settings_updated_at: row?.updated_at ?? null,
      updated_at: new Date().toISOString(),
      entries: redactAmounts(live.entries, showAmount),
    });
  }

  const stage = clampStage(row.stage, stages.length);
  const frozen = row.freeze_on_start && Array.isArray(row.snapshot);
  // Saat dibekukan, snapshot adalah sumber tunggal. Saat tidak, papan diambil
  // ulang setiap permintaan sehingga urutan mengikuti transaksi terbaru.
  let source: LeaderboardEntry[];
  if (frozen) {
    source = row.snapshot as LeaderboardEntry[];
  } else {
    const live = await liveEntries(limit, eventId);
    if (live.error) return apiError(mapDatabaseError(live.error), 500);
    source = live.entries;
  }

  const range = visibleRange(stage, stages, limit);
  // `from`/`to` adalah nomor peringkat (mulai 1), sedangkan slice memakai indeks
  // (mulai 0). Entri juga difilter berdasarkan `rank` aslinya, bukan posisinya di
  // array: bila papan pendek atau ada nomor yang terlewat, memotong berdasarkan
  // posisi akan menampilkan peserta yang salah pada tahap yang salah.
  const entries = range ? source.filter((entry) => Number(entry.rank) >= range.from && Number(entry.rank) <= range.to) : [];

  return Response.json({
    mode: row.mode,
    leaderboard_enabled: enabled,
    stage,
    stage_count: stages.length,
    stage_label: range?.label ?? null,
    layout: range?.layout ?? "list",
    // Dikirim agar layar bisa menomori baris dengan benar pada tahap yang tidak
    // dimulai dari peringkat 1 (mis. tahap "4-10").
    from: range?.from ?? 1,
    frozen,
    // Konfigurasi ikut di response PUBLIK, dan itu aman: `stages` hanya berisi
    // NOMOR peringkat dan label tahap, bukan nama atau nominal siapa pun.
    // Menyertakannya di sini membuat halaman operator cukup memakai GET untuk
    // menyegarkan diri. Alternatifnya — POST no-op — akan menulis `updated_at`
    // dan satu baris audit setiap dua detik, menenggelamkan riwayat audit hari
    // itu hanya karena ada tab yang terbuka.
    stages,
    freeze_on_start: row.freeze_on_start,
    frozen_at: row.frozen_at,
    settings_updated_at: row.updated_at,
    updated_at: new Date().toISOString(),
    entries: redactAmounts(entries, showAmount),
  });
}

const stageSchema = z.object({
  from: z.number().int().min(1).max(50),
  to: z.number().int().min(1).max(50),
  label: z.string().trim().min(1).max(60),
  layout: z.enum(["spotlight", "list"]),
}).refine((value) => value.to >= value.from, { message: "Peringkat akhir tidak boleh lebih kecil dari peringkat awal" });

const postSchema = z.object({
  action: z.enum(REVEAL_ACTIONS),
  mode: z.enum(["off", "staged"]).optional(),
  freeze_on_start: z.boolean().optional(),
  stages: z.array(stageSchema).min(1).max(10).optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { action } = parsed.data;

  // "config" tanpa satu pun field yang diubah ditolak, bukan diperlakukan sebagai
  // pembacaan. Kalau dibiarkan lewat, ia menulis `updated_at` dan satu baris
  // audit setiap kali dipanggil, dan setiap klien yang menyegarkan diri akan
  // membanjiri riwayat audit hari acara. Pembacaan memakai GET.
  if (action === "config" && parsed.data.mode === undefined && parsed.data.freeze_on_start === undefined && parsed.data.stages === undefined) {
    return apiError("VALIDATION_ERROR", 422, { form: ["Tidak ada setting reveal yang diubah."] });
  }

  const client = getSupabaseServiceClient();
  const [currentResult, displayResult] = await Promise.all([
    client.from("leaderboard_reveal").select(ROW).eq("event_id", eventId).maybeSingle(),
    client.from("display_settings").select("leaderboard_limit").eq("event_id", eventId).maybeSingle(),
  ]);
  // Baris singleton dibuat oleh migrasi, tapi bila entah bagaimana hilang, ia
  // dibuat ulang di sini alih-alih menolak permintaan. Halaman ini dipakai di atas
  // panggung: "baris tidak ditemukan" pada saat itu tidak bisa ditindaklanjuti
  // siapa pun, sedangkan memasang ulang nilai bawaan selalu benar.
  let current = currentResult.data as RevealRow | null;
  if (!current) {
    // `id` TIDAK lagi ditulis tangan: tabel ini kini satu baris per event dan
    // `id` diisi sequence (lihat 202608070004). Menulis `id: 1` akan menabrak
    // baris event pertama.
    const inserted = await client.from("leaderboard_reveal").insert({ event_id: eventId } as never).select(ROW).single();
    if (inserted.error) return apiError("INTERNAL_ERROR", 500);
    current = inserted.data as RevealRow;
  }
  const limit = (displayResult.data as { leaderboard_limit?: number } | null)?.leaderboard_limit ?? 10;

  // Tahap yang dipakai untuk menjepit adalah tahap SETELAH patch, bukan sebelum:
  // "config" boleh mengubah daftar tahap dan tahap sekarang harus langsung ikut
  // batas yang baru, kalau tidak stage bisa menggantung di luar jangkauan.
  const stages = normalizeStages(parsed.data.stages ?? current.stages);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.user.id };
  if (parsed.data.stages) patch.stages = stages;
  if (parsed.data.freeze_on_start !== undefined) patch.freeze_on_start = parsed.data.freeze_on_start;

  const freezeOnStart = parsed.data.freeze_on_start ?? current.freeze_on_start;

  switch (action) {
    case "config": {
      if (parsed.data.mode) patch.mode = parsed.data.mode;
      // Mematikan mode membersihkan state reveal sekalian. Kalau tidak, panitia
      // yang mematikan lalu menyalakan mode lagi akan mendarat di tahap terakhir
      // yang tertinggal — pemenang langsung tampil tanpa ada yang menekan apa pun.
      if (parsed.data.mode === "off") Object.assign(patch, { stage: 0, snapshot: null, frozen_at: null });
      else patch.stage = clampStage(current.stage, stages.length);
      break;
    }
    case "start": {
      patch.mode = "staged";
      patch.stage = 0;
      if (freezeOnStart) {
        const live = await liveEntries(limit, eventId);
        if (live.error) return apiError(mapDatabaseError(live.error), 500);
        patch.snapshot = live.entries;
        patch.frozen_at = new Date().toISOString();
      } else {
        patch.snapshot = null;
        patch.frozen_at = null;
      }
      break;
    }
    // Next BERHENTI di tahap terakhir, tidak melanjut ke papan penuh: papan penuh
    // punya tombolnya sendiri. Kalau Next ikut membukanya, operator yang menekan
    // sekali kelebihan akan menampilkan seluruh peringkat lebih cepat dari yang
    // direncanakan MC — dan itu tidak bisa ditarik kembali di depan penonton.
    case "next": patch.stage = Math.min(stages.length, clampStage(current.stage, stages.length) + 1); break;
    case "prev": patch.stage = clampStage(clampStage(current.stage, stages.length) - 1, stages.length); break;
    case "show_all": patch.stage = showAllStage(stages.length); break;
    case "reset": Object.assign(patch, { stage: 0, snapshot: null, frozen_at: null }); break;
  }

  const { data, error } = await client.from("leaderboard_reveal").update(patch as never).eq("event_id", eventId).select(ROW).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  const saved = data as RevealRow;

  // Audit sengaja HANYA untuk start, reset, dan config. next/prev bisa ditekan
  // puluhan kali dalam satu ceremony; mencatat semuanya akan menenggelamkan
  // riwayat audit hari itu tanpa menambah informasi — tahap akhirnya tetap
  // terlihat pada baris berikutnya.
  if (action === "start" || action === "reset" || action === "config") {
    // Snapshot dibuang dari payload audit: isinya seluruh papan dan akan
    // menggelembungkan baris audit tanpa dibaca siapa pun.
    const strip = (row: RevealRow | null) => row && { ...row, snapshot: Array.isArray(row.snapshot) ? `${row.snapshot.length} entri` : null };
    await client.from("audit_logs").insert({
      event_id: eventId,
      user_id: auth.user.id,
      action: `leaderboard_reveal_${action}`,
      payload: { old: strip(current), new: strip(saved) },
    } as never);
  }

  // Bentuknya disamakan dengan GET (tanpa `entries`) supaya halaman operator bisa
  // memakai satu fungsi untuk menerapkan hasil GET maupun POST. Snapshot tidak
  // pernah dikirim ke klien: isinya papan penuh, dan halaman operator terbuka di
  // perangkat yang sama sekali tidak perlu melihatnya.
  return Response.json({
    mode: saved.mode,
    stage: clampStage(saved.stage, normalizeStages(saved.stages).length),
    stages: normalizeStages(saved.stages),
    freeze_on_start: saved.freeze_on_start,
    frozen_at: saved.frozen_at,
    settings_updated_at: saved.updated_at,
  });
}
