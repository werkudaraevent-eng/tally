import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeSeatMapGeometry, duplicateTableLabels, normalizeLayout, normalizeLayoutParams, normalizeSeatLabel, MAX_SEATS_PER_TABLE, MAX_TABLE_LABEL_LENGTH, PUBLIC_VIEW_MODES, SEAT_MAP_LAYOUTS, type SeatMapConfig } from "@/lib/seat-map";
import {
  CONFIG_COLUMNS,
  LEGACY_CONFIG_COLUMNS,
  discoverSubEvents,
  loadAssignmentsForSession,
  loadSeatMapConfig,
  loadSessions,
  type SeatMapSession,
} from "@/lib/seat-map-data";

// CMS denah tempat duduk. Admin saja.
//
// Yang bisa diatur di sini hanya geometri ruangan dan tampilan. Penempatan orang
// tetap milik scanner API dan tidak pernah ditulis dari sini; kalau penempatan
// juga bisa diedit di dua tempat, hari H akan ada dua jawaban berbeda untuk
// pertanyaan yang sama.

/**
 * Membaca konfigurasi denah, tahan terhadap kolom tata ruang yang belum ada.
 * Alasannya sama dengan `selectSeatMapConfig` di lapisan data: kode bisa hidup
 * beberapa menit sebelum migrasinya dijalankan, dan PostgREST menolak seluruh
 * SELECT bila satu kolom di dalamnya belum ada.
 */
async function bacaConfig(client: ReturnType<typeof getSupabaseServiceClient>, eventId: string) {
  const lengkap = await client.from("seat_maps").select(CONFIG_COLUMNS).eq("event_id", eventId).single();
  if (!lengkap.error) return lengkap;
  return client.from("seat_maps").select(LEGACY_CONFIG_COLUMNS).eq("event_id", eventId).single();
}

const configSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  stage_label: z.string().trim().min(1).max(60).optional(),
  row_table_counts: z.array(z.number().int().min(1).max(40)).min(1).max(20).optional(),
  seat_rules: z
    .array(
      z.object({
        from: z.number().int().min(1).max(999),
        to: z.number().int().min(1).max(999),
        seats: z.number().int().min(0).max(MAX_SEATS_PER_TABLE),
      }),
    )
    .max(40)
    .optional(),
  seat_label_pattern: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((value) => value.includes("{table}") && value.includes("{seat}"), {
      message: "Pola wajib memuat {table} dan {seat}.",
    })
    .optional(),
  table_overrides: z
    .record(z.string().regex(/^\d{1,3}$/), z.object({ dx: z.number().min(-200).max(200), dy: z.number().min(-200).max(200) }))
    .optional(),
  // Label meja yang menyimpang dari nomor urutnya, mis. {"4": "3A"}.
  //
  // Kuncinya nomor POSISI, pola sama dengan `table_overrides` di atas. String
  // kosong diterima di sini dengan sengaja: itulah cara admin membatalkan label
  // dan mengembalikan meja ke nomornya. `normalizeConfig` yang membuangnya,
  // sehingga tidak ada meja tanpa tulisan di layar.
  table_labels: z.record(z.string().regex(/^\d{1,3}$/), z.string().trim().max(MAX_TABLE_LABEL_LENGTH)).optional(),
  layout_type: z.enum(SEAT_MAP_LAYOUTS as unknown as [string, ...string[]]).optional(),
  // Parameter tata ruang. Dibiarkan sebagai objek longgar di sini lalu
  // dibersihkan `normalizeLayoutParams`: batas atas-bawah tiap angka hidup di
  // satu tempat bersama nilai bawaannya, bukan disalin ke skema Zod yang bisa
  // berbeda pendapat.
  layout_params: z.record(z.string(), z.unknown()).optional(),
  // Mode bawaan untuk semua layar publik. Layar tertentu tetap bisa menimpanya
  // lewat ?mode= pada URL-nya.
  public_view_mode: z.enum(PUBLIC_VIEW_MODES as unknown as [string, ...string[]]).optional(),
  // Agenda bawaan layar publik. `null` berarti kembali memakai agenda
  // terpublikasi pertama.
  default_session_id: z.number().int().positive().nullable().optional(),
});

// Agenda dikelola di /api/admin/seat-map/sessions, bukan di sini. Satu jalur
// tulis saja: kalau agenda bisa diubah dari dua endpoint, aturannya akan
// bercabang dan salah satu cabang pasti tertinggal saat ada perubahan.

/**
 * Laporan pencocokan label: jembatan antara denah dan data peserta.
 *
 * Arah yang paling berbahaya adalah label API yang tidak ada di denah, karena
 * artinya ada peserta yang tidak muncul di mana pun. Karena itu dilaporkan
 * eksplisit, bukan dibuang diam-diam.
 */
async function buildMatchReport(eventId: string, sessions: SeatMapSession[], config: Awaited<ReturnType<typeof loadSeatMapConfig>>) {
  const geometry = computeSeatMapGeometry(config);
  const knownLabels = new Set<string>();
  for (const table of geometry.tables) {
    for (const seat of table.seats) knownLabels.add(normalizeSeatLabel(seat.label));
  }

  const reports = [];
  for (const session of sessions) {
    const { assignments, participantsWithoutSeat, totalActiveParticipants } = await loadAssignmentsForSession(eventId, session.sub_event_id);
    const matchedLabels = new Set<string>();
    const unmatched = new Map<string, number>();

    for (const assignment of assignments) {
      if (knownLabels.has(assignment.normalizedLabel)) matchedLabels.add(assignment.normalizedLabel);
      else unmatched.set(assignment.seatLabel, (unmatched.get(assignment.seatLabel) ?? 0) + 1);
    }

    reports.push({
      session_id: session.id,
      slug: session.slug,
      total_assignments: assignments.length,
      matched_seats: matchedLabels.size,
      // Contoh dibatasi: admin butuh tahu polanya salah, bukan membaca 199 baris.
      unmatched_labels: [...unmatched.keys()].slice(0, 25),
      unmatched_count: unmatched.size,
      empty_seats: geometry.totalSeats - matchedLabels.size,
      participants_without_seat: participantsWithoutSeat,
      total_active_participants: totalActiveParticipants,
    });
  }
  return { geometry: { total_tables: geometry.totalTables, total_seats: geometry.totalSeats }, reports };
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  try {
    const [config, sessions, subEvents] = await Promise.all([
      loadSeatMapConfig(eventId),
      loadSessions(eventId, { publishedOnly: false }),
      discoverSubEvents(eventId),
    ]);
    const match = await buildMatchReport(eventId, sessions, config);

    return Response.json({
      config,
      sessions,
      // Daftar sub-event dari data asli. Admin memilih dari sini, tidak menyalin
      // id dengan tangan: satu salah ketik dan seluruh denah tampak kosong.
      available_sub_events: subEvents,
      ...match,
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const body = await request.json().catch(() => null);
  const parsed = configSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return apiError("VALIDATION_ERROR", 422, parsed.success ? undefined : parsed.error.flatten());
  }
  for (const rule of parsed.data.seat_rules ?? []) {
    if (rule.from > rule.to) {
      return apiError("VALIDATION_ERROR", 422, { message: "Rentang meja tidak valid: nomor awal melebihi nomor akhir." });
    }
  }

  const client = getSupabaseServiceClient();

  // Label meja ganda ditolak DI SINI, bukan hanya diperingatkan di layar.
  //
  // Dua meja bernama sama membuat satu label kursi ("A5") ada di dua tempat, dan
  // pencocokan dengan data peserta akan menyorot keduanya sekaligus — tamu
  // dikirim ke meja yang salah tanpa satu pun pesan kesalahan muncul. Ini satu-
  // satunya kesalahan pada fitur label yang tidak terlihat dari denah, jadi ia
  // tidak boleh bisa tersimpan.
  //
  // Diperiksa terhadap konfigurasi GABUNGAN, bukan hanya kiriman ini: PATCH
  // bersifat sebagian, jadi admin bisa mengirim `table_labels` saja sementara
  // jumlah barisnya datang dari baris yang sudah tersimpan. Memeriksa kiriman
  // saja akan meloloskan bentrokan yang lahir dari gabungan keduanya.
  if (parsed.data.table_labels || parsed.data.row_table_counts) {
    const { data: existing } = await bacaConfig(client, eventId);
    // Cast: `layout_type` datang dari Zod sebagai string biasa, sedangkan
    // `SeatMapConfig` memakai union sempit. `normalizeConfig` di dalam
    // pemeriksa ini yang menyaringnya, jadi nilai ngawur tetap jatuh ke bawaan.
    const duplicates = duplicateTableLabels({ ...(existing ?? {}), ...parsed.data } as Partial<SeatMapConfig>);
    if (duplicates.length > 0) {
      return apiError("VALIDATION_ERROR", 422, {
        message: `Label meja tidak boleh sama: ${duplicates.join(", ")}. Dua meja bernama sama membuat tamu diarahkan ke meja yang salah.`,
      });
    }
  }

  // Agenda bawaan wajib ada dan sudah dipublikasikan. Menyimpan agenda draf
  // sebagai bawaan akan membuat layar publik diam-diam jatuh ke agenda lain,
  // sehingga admin merasa pilihannya tidak tersimpan.
  if (parsed.data.default_session_id != null) {
    const { data: target } = await client
      .from("seat_map_sessions")
      .select("id,is_published")
      .eq("event_id", eventId)
      .eq("id", parsed.data.default_session_id)
      .maybeSingle() as { data: { id: number; is_published: boolean } | null };
    if (!target) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);
    if (!target.is_published) {
      return apiError("VALIDATION_ERROR", 422, { message: "Agenda bawaan harus dipublikasikan lebih dulu." });
    }
  }
  const { data: current } = await bacaConfig(client, eventId);

  // Berpindah tata ruang DITOLAK begitu ada penempatan peserta.
  //
  // Label kursi adalah kunci pencocokan dengan data peserta — dari scanner API,
  // entri manual, maupun impor berkas. Layout menentukan bentuk labelnya:
  // banquet menghasilkan "12A", theater menghasilkan "A12". Menggantinya setelah
  // penempatan masuk membuat seluruh pencocokan gugur, dan akibatnya BUKAN pesan
  // kesalahan melainkan denah yang tampak normal dengan semua kursi kosong.
  // Kegagalan yang tidak terlihat seperti itu baru ketahuan di hari-H.
  const layoutBaru = parsed.data.layout_type;
  const layoutLama = normalizeLayout((current as { layout_type?: unknown } | null)?.layout_type);
  if (layoutBaru && normalizeLayout(layoutBaru) !== layoutLama) {
    // Dibaca sampai 500 baris, bukan dihitung seluruhnya: yang dibutuhkan hanya
    // jawaban ada/tidak ada, dan satu penempatan saja sudah cukup untuk menolak.
    const { data: peserta } = await client
      .from("participants")
      .select("seats")
      .eq("event_id", eventId)
      .not("seats", "is", null)
      .limit(500);
    const adaPenempatan = ((peserta ?? []) as Array<{ seats: unknown }>).some(
      (baris) => Array.isArray(baris.seats) && baris.seats.length > 0,
    );
    if (adaPenempatan) {
      return apiError("VALIDATION_ERROR", 422, {
        message:
          "Tata ruang tidak dapat diganti karena sudah ada peserta yang punya nomor kursi. " +
          "Mengganti tata ruang mengubah bentuk label kursi, sehingga seluruh penempatan yang " +
          "sudah masuk tidak lagi cocok. Kosongkan nomor kursi peserta lebih dulu bila ruangan memang ditata ulang.",
      });
    }
  }

  // Geseran manual meja dibuang saat layout berganti: koordinatnya dihitung
  // generator yang berbeda, jadi "geser meja 4 sejauh 25px" tidak lagi menunjuk
  // meja yang sama — dan meja yang meleset di denah lebih buruk daripada denah
  // rapi yang perlu digeser ulang.
  const muatan: Record<string, unknown> = { ...parsed.data };
  if (layoutBaru && normalizeLayout(layoutBaru) !== layoutLama) {
    muatan.table_overrides = {};
  }
  if (parsed.data.layout_params || layoutBaru) {
    const layoutAkhir = normalizeLayout(layoutBaru ?? layoutLama);
    // Saat layout BERGANTI, parameter lama tidak ikut: nilai milik banquet
    // (busur 300) yang terbawa ke cabaret akan menimpa bawaannya (190) dan
    // membuat pilihan barunya tampak tidak melakukan apa-apa. Saat layout tetap,
    // parameter tersimpan dipertahankan supaya PATCH sebagian tidak menghapus
    // setelan yang tidak disebut permintaan ini.
    const bergantiLayout = Boolean(layoutBaru) && normalizeLayout(layoutBaru) !== layoutLama;
    const sebelumnya = bergantiLayout ? {} : (current as { layout_params?: unknown } | null)?.layout_params;
    muatan.layout_params = normalizeLayoutParams(layoutAkhir, {
      ...(sebelumnya && typeof sebelumnya === "object" ? sebelumnya : {}),
      ...(parsed.data.layout_params ?? {}),
    });
  }

  const { data, error } = await client
    .from("seat_maps")
    .update({ ...muatan, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", eventId)
    .select(CONFIG_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "seat_map_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}


