import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeSeatMapGeometry, normalizeSeatLabel } from "@/lib/seat-map";
import { loadAssignmentsForSession, loadSeatMapConfig, loadSessions } from "@/lib/seat-map-data";
import { publicSeatOccupantLabel, type NameDisplayMode } from "@/lib/seat-map-privacy";

// Denah publik. Tanpa login, mengikuti pola /api/leaderboard.
//
// Yang dikirim ke publik hanya keterisian per kursi, bukan daftar tamu. Nama
// lengkap tidak pernah keluar dari endpoint ini; pencarian nama ditangani
// endpoint terpisah yang hanya mengembalikan kursi milik penanya.

const querySchema = z.object({ sesi: z.string().trim().max(40).optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  try {
    const sessions = await loadSessions({ publishedOnly: true });
    if (sessions.length === 0) {
      // Bukan error: sebelum hari H memang belum ada yang dipublikasikan.
      // Halaman publik menampilkan pesan tunggu, bukan layar rusak.
      return Response.json({ published: false, sessions: [], session: null, config: null, seats: {}, summary: null });
    }

    const session = parsed.data.sesi
      ? sessions.find((item) => item.slug === parsed.data.sesi)
      : sessions[0];
    if (!session) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

    const [config, settingsResult, assignmentData] = await Promise.all([
      loadSeatMapConfig(),
      getSupabaseServiceClient().from("event_settings").select("name_display_mode").eq("id", 1).single(),
      loadAssignmentsForSession(session.sub_event_id),
    ]);

    const mode = ((settingsResult.data as { name_display_mode?: NameDisplayMode } | null)?.name_display_mode
      ?? "initials") as NameDisplayMode;

    const geometry = computeSeatMapGeometry(config);
    const knownSeatLabels = new Set<string>();
    for (const table of geometry.tables) {
      for (const seat of table.seats) knownSeatLabels.add(normalizeSeatLabel(seat.label));
    }

    // Keterisian per kursi. Kunci memakai label ternormalisasi supaya beda
    // penulisan huruf besar-kecil tidak dianggap kursi yang berbeda.
    const seats: Record<string, { occupied: boolean; checkedIn: boolean; occupants: string[] }> = {};
    let unmatchedLabels = 0;

    for (const assignment of assignmentData.assignments) {
      // Label yang tidak dikenal denah berarti ada peserta yang tidak muncul di
      // mana pun. Dihitung agar terlihat di CMS, tidak dibuang diam-diam.
      if (!knownSeatLabels.has(assignment.normalizedLabel)) {
        unmatchedLabels += 1;
        continue;
      }
      const entry = seats[assignment.normalizedLabel] ?? { occupied: false, checkedIn: false, occupants: [] };
      entry.occupied = true;
      entry.checkedIn = entry.checkedIn || assignment.checkedIn;
      entry.occupants.push(publicSeatOccupantLabel(assignment, mode));
      seats[assignment.normalizedLabel] = entry;
    }

    const occupiedSeats = Object.keys(seats).length;

    return Response.json({
      published: true,
      updated_at: new Date().toISOString(),
      sessions: sessions.map(({ slug, name }) => ({ slug, name })),
      session: {
        slug: session.slug,
        name: session.name,
        title: session.title,
        subtitle: session.subtitle,
        background_color: session.background_color,
        text_color: session.text_color,
        accent_color: session.accent_color,
        has_assignments: session.sub_event_id !== null,
      },
      config: {
        stage_label: config.stage_label,
        row_table_counts: config.row_table_counts,
        seat_rules: config.seat_rules,
        seat_label_pattern: config.seat_label_pattern,
        table_overrides: config.table_overrides,
      },
      // Mode bawaan layar. Halaman publik boleh menimpanya lewat ?mode= agar
      // satu acara bisa menjalankan LED dan layar sentuh sekaligus.
      public_view_mode: config.public_view_mode,
      seats,
      summary: {
        total_tables: geometry.totalTables,
        total_seats: geometry.totalSeats,
        occupied_seats: occupiedSeats,
        checked_in_seats: Object.values(seats).filter((seat) => seat.checkedIn).length,
        unmatched_labels: unmatchedLabels,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
