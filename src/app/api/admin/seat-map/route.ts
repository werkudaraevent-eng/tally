import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeSeatMapGeometry, normalizeSeatLabel, MAX_SEATS_PER_TABLE, PUBLIC_VIEW_MODES } from "@/lib/seat-map";
import {
  CONFIG_COLUMNS,
  SESSION_COLUMNS,
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

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");

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
  // Mode bawaan untuk semua layar publik. Layar tertentu tetap bisa menimpanya
  // lewat ?mode= pada URL-nya.
  public_view_mode: z.enum(PUBLIC_VIEW_MODES as unknown as [string, ...string[]]).optional(),
});

const sessionPatchSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  sub_event_id: z.string().trim().max(120).nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  subtitle: z.string().trim().max(160).nullable().optional(),
  background_color: hex.optional(),
  text_color: hex.optional(),
  accent_color: hex.optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

/**
 * Laporan pencocokan label: jembatan antara denah dan data peserta.
 *
 * Arah yang paling berbahaya adalah label API yang tidak ada di denah, karena
 * artinya ada peserta yang tidak muncul di mana pun. Karena itu dilaporkan
 * eksplisit, bukan dibuang diam-diam.
 */
async function buildMatchReport(sessions: SeatMapSession[], config: Awaited<ReturnType<typeof loadSeatMapConfig>>) {
  const geometry = computeSeatMapGeometry(config);
  const knownLabels = new Set<string>();
  for (const table of geometry.tables) {
    for (const seat of table.seats) knownLabels.add(normalizeSeatLabel(seat.label));
  }

  const reports = [];
  for (const session of sessions) {
    const { assignments, participantsWithoutSeat, totalActiveParticipants } = await loadAssignmentsForSession(session.sub_event_id);
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

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  try {
    const [config, sessions, subEvents] = await Promise.all([
      loadSeatMapConfig(),
      loadSessions({ publishedOnly: false }),
      discoverSubEvents(),
    ]);
    const match = await buildMatchReport(sessions, config);

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
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

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
  const { data: current } = await client.from("seat_maps").select(CONFIG_COLUMNS).eq("id", 1).single();
  const { data, error } = await client
    .from("seat_maps")
    .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("id", 1)
    .select(CONFIG_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "seat_map_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = sessionPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("seat_map_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

  const { data, error } = await client
    .from("seat_map_sessions")
    .update({
      ...changes,
      // String kosong dari form berarti "belum dipilih", bukan id kosong yang
      // tidak akan pernah cocok dengan apa pun.
      ...(changes.sub_event_id !== undefined ? { sub_event_id: changes.sub_event_id?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", id)
    .select(SESSION_COLUMNS)
    .single();
  if (error) return apiError(error.code === "23505" ? "DUPLICATE_SEAT_MAP_SLUG" : "INTERNAL_ERROR", error.code === "23505" ? 422 : 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "seat_map_session_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}
