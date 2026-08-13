import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeSeatMapGeometry, normalizeSeatLabel } from "@/lib/seat-map";
import { loadAssignmentsForSession, loadSeatMapConfig, loadSessions, resolveSession } from "@/lib/seat-map-data";
import { publicSeatOccupantLabel, type NameDisplayMode } from "@/lib/seat-map-privacy";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

// Denah publik. Tanpa login, mengikuti pola /api/leaderboard.
//
// Yang dikirim ke publik hanya keterisian per kursi, bukan daftar tamu. Nama
// lengkap tidak pernah keluar dari endpoint ini; pencarian nama ditangani
// endpoint terpisah yang hanya mengembalikan kursi milik penanya.

const querySchema = z.object({ sesi: z.string().trim().max(40).optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("INTERNAL_ERROR", 404);
  const eventId = event.id;

  try {
    // Konfigurasi dibaca lebih dulu karena agenda bawaan tersimpan di sana, dan
    // pilihan agenda menentukan penempatan mana yang perlu diambil.
    const [config, sessions] = await Promise.all([
      loadSeatMapConfig(eventId),
      loadSessions(eventId, { publishedOnly: true }),
    ]);

    if (sessions.length === 0) {
      // Bukan error: sebelum hari H memang belum ada yang dipublikasikan.
      // Halaman publik menampilkan pesan tunggu, bukan layar rusak.
      return Response.json({ published: false, sessions: [], session: null, config: null, seats: {}, summary: null, time_zone: DEFAULT_TIME_ZONE });
    }

    const session = resolveSession(sessions, {
      requestedSlug: parsed.data.sesi,
      defaultSessionId: config.default_session_id,
    });
    if (!session) return apiError("SEAT_MAP_SESSION_NOT_FOUND", 404);

    const [settingsResult, assignmentData] = await Promise.all([
      // Zona waktu ikut diambil di query yang memang sudah ada, bukan lewat
      // permintaan kedua: halaman /denah publik sehingga tidak bisa memakai
      // /api/settings yang butuh login, dan jam "terakhir dimuat" di sana harus
      // memakai zona acara.
      getSupabaseServiceClient().from("event_settings").select("name_display_mode,time_zone").eq("event_id", eventId).single(),
      loadAssignmentsForSession(eventId, session.sub_event_id),
    ]);

    const settingsRow = settingsResult.data as { name_display_mode?: NameDisplayMode; time_zone?: string } | null;
    const mode = (settingsRow?.name_display_mode ?? "initials") as NameDisplayMode;
    const timeZone = normalizeTimeZone(settingsRow?.time_zone);

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
        background_image_url: session.background_image_url,
        map_panel_transparent: session.map_panel_transparent,
        has_assignments: session.sub_event_id !== null,
        // Warna kursi. Dikirim apa adanya termasuk null, karena null di sini
        // BERARTI sesuatu ("ikuti warna latar / warna teks") dan diselesaikan
        // oleh `resolveSeatColors` di renderer. Mengubahnya jadi warna nyata di
        // sini akan membekukan pilihan itu, sehingga mengganti `text_color`
        // tidak lagi ikut mengubah kursi seperti yang selama ini terjadi.
        seat_available_color: session.seat_available_color,
        seat_occupied_color: session.seat_occupied_color,
        seat_checked_in_color: session.seat_checked_in_color,
        seat_outline_color: session.seat_outline_color,
        // Branding header/footer. Dikirim apa adanya karena `loadSessions` sudah
        // menormalkannya, jadi halaman publik tidak perlu tahu bahwa skala di
        // database berbentuk string.
        logo_url: session.logo_url,
        logo_scale: session.logo_scale,
        footer_image_url: session.footer_image_url,
        footer_image_scale: session.footer_image_scale,
        footer_text: session.footer_text,
        heading_font: session.heading_font,
        title_scale: session.title_scale,
        subtitle_scale: session.subtitle_scale,
        footer_scale: session.footer_scale,
        title_color: session.title_color,
        subtitle_color: session.subtitle_color,
        footer_text_color: session.footer_text_color,
      },
      config: {
        stage_label: config.stage_label,
        row_table_counts: config.row_table_counts,
        seat_rules: config.seat_rules,
        seat_label_pattern: config.seat_label_pattern,
        table_overrides: config.table_overrides,
        // Wajib ikut: halaman publik menghitung ulang geometri di browser, jadi
        // tanpa ini meja yang seharusnya "3A" akan tampil sebagai "4" di layar
        // tamu walau CMS sudah benar.
        table_labels: config.table_labels,
      },
      // Mode bawaan layar. Halaman publik boleh menimpanya lewat ?mode= agar
      // satu acara bisa menjalankan LED dan layar sentuh sekaligus.
      public_view_mode: config.public_view_mode,
      time_zone: timeZone,
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
