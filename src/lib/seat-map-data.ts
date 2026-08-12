import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, normalizeBranding, type Branding } from "@/lib/branding";
import { normalizeConfig, normalizePublicViewMode, normalizeSeatColors, normalizeSeatLabel, SEAT_COLOR_COLUMNS, type PublicViewMode, type SeatColors, type SeatMapConfig } from "@/lib/seat-map";

// Lapisan data denah tempat duduk. Server-only, dipakai bersama API publik dan
// CMS admin supaya aturan pencocokan label hanya ada di satu tempat.
//
// Prinsip yang dipegang: modul ini hanya MEMBACA `participants`. Penempatan
// orang milik scanner API; yang dimiliki aplikasi ini cuma geometri ruangan.
// Karena itu tidak ada satu pun operasi tulis ke tabel peserta di sini.

export type SeatMapSession = {
  id: number;
  slug: string;
  name: string;
  sub_event_id: string | null;
  title: string;
  subtitle: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  /** Null berarti memakai `background_color`. Sama seperti Live Display. */
  background_image_url: string | null;
  /**
   * True berarti kanvas denah dibuat tembus pandang agar gambar latar terlihat
   * di belakang meja. Hanya berpengaruh bila `background_image_url` terisi:
   * tanpa gambar, kanvas tembus pandang hanya menampilkan warna yang sama.
   */
  map_panel_transparent: boolean;
  is_published: boolean;
  sort_order: number;
} & Branding & SeatColors;

export const SESSION_COLUMNS =
  `id,slug,name,sub_event_id,title,subtitle,background_color,text_color,accent_color,background_image_url,map_panel_transparent,is_published,sort_order,${BRANDING_COLUMNS},${SEAT_COLOR_COLUMNS}`;

export const CONFIG_COLUMNS =
  "name,stage_label,row_table_counts,seat_rules,seat_label_pattern,table_overrides,table_labels,public_view_mode,default_session_id,updated_at";

type ParticipantSeat = { subEventId: string; subEventName: string; label: string };

type ParticipantRow = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  allow_name_display: boolean;
  participant_type: string | null;
  source_checked_in: boolean;
  seats: ParticipantSeat[] | null;
};

/** Satu penempatan orang di satu kursi, sudah dipilih untuk satu sesi. */
export type SeatAssignment = {
  participantId: string;
  name: string;
  company: string | null;
  title: string | null;
  participantType: string | null;
  allowNameDisplay: boolean;
  checkedIn: boolean;
  seatLabel: string;
  normalizedLabel: string;
};

export type SeatMapConfigRow = SeatMapConfig & {
  name: string;
  public_view_mode: PublicViewMode;
  /** Agenda yang tampil di layar publik bila alamatnya tidak menyebut `?sesi=`. */
  default_session_id: number | null;
};

/**
 * `eventId` WAJIB di seluruh fungsi modul ini, bukan opsional.
 *
 * Denah, daftar agenda, dan penempatan kursi semuanya per event. Kalau parameter
 * ini opsional, pemanggil yang lupa tetap lolos compile lalu diam-diam
 * menampilkan denah event lain -- kesalahan yang tidak menimbulkan galat, hanya
 * tamu yang diarahkan ke meja yang tidak ada.
 */
export async function loadSeatMapConfig(eventId: string): Promise<SeatMapConfigRow> {
  const { data } = await getSupabaseServiceClient()
    .from("seat_maps")
    .select(CONFIG_COLUMNS)
    .eq("event_id", eventId)
    .single();
  const raw = (data ?? {}) as Partial<SeatMapConfig> & { name?: string; public_view_mode?: string; default_session_id?: number | null };
  return {
    ...normalizeConfig(raw),
    name: typeof raw.name === "string" ? raw.name : "Denah",
    public_view_mode: normalizePublicViewMode(raw.public_view_mode),
    default_session_id: typeof raw.default_session_id === "number" ? raw.default_session_id : null,
  };
}

/**
 * Memilih agenda yang ditampilkan.
 *
 * Urutan kewenangan, dari yang paling menentukan:
 *   1. `?sesi=` pada alamat layar — satu-satunya cara menjalankan dua layar
 *      dengan agenda berbeda pada waktu yang sama.
 *   2. Agenda bawaan pilihan admin — memindahkan seluruh layar sekaligus.
 *   3. Agenda terpublikasi pertama — jaring pengaman supaya layar tetap berisi.
 *
 * Agenda bawaan yang sudah tidak dipublikasikan sengaja diabaikan: kalau tetap
 * dipakai, admin yang menarik sebuah agenda dari publik akan mendapati agenda itu
 * masih tampil di LED.
 */
export function resolveSession(
  sessions: SeatMapSession[],
  options: { requestedSlug?: string | null; defaultSessionId?: number | null },
) {
  if (sessions.length === 0) return null;
  if (options.requestedSlug) {
    return sessions.find((item) => item.slug === options.requestedSlug) ?? null;
  }
  if (options.defaultSessionId != null) {
    const preferred = sessions.find((item) => item.id === options.defaultSessionId);
    if (preferred) return preferred;
  }
  return sessions[0];
}

export async function loadSessions(eventId: string, options: { publishedOnly: boolean }) {
  let query = getSupabaseServiceClient().from("seat_map_sessions").select(SESSION_COLUMNS).eq("event_id", eventId);
  if (options.publishedOnly) query = query.eq("is_published", true);
  const { data } = await query.order("sort_order", { ascending: true });

  // Kolom branding dinormalisasi di sini, bukan di komponen layar.
  //
  // `numeric` di Postgres diserialkan menjadi string oleh driver agar presisinya
  // tidak hilang, jadi skala yang belum diproses tidak bisa dipakai langsung
  // dalam perhitungan CSS. Menormalkannya di satu tempat memastikan API publik
  // dan CMS admin menerima bentuk yang sama, dan layar tidak perlu tahu bahwa
  // asal datanya berupa string.
  return ((data ?? []) as unknown as SeatMapSession[]).map((row) => ({
    ...row,
    ...normalizeBranding(row as unknown as Record<string, unknown>),
    // Warna kursi dinormalisasi di sini juga, sejalan dengan branding: nilai yang
    // bukan hex enam digit jatuh ke null, sehingga renderer cukup memeriksa null
    // dan tidak perlu tahu ada bentuk penulisan warna yang tidak sah.
    ...normalizeSeatColors(row as unknown as Record<string, unknown>),
  }));
}

/**
 * Membaca peserta aktif beserta kursinya.
 *
 * Sengaja mengambil seluruh baris lalu mencocokkan di memori, bukan menyaring
 * lewat query jsonb. Peserta acara ini hanya ratusan orang, jadi biayanya tidak
 * terasa, dan sebagai gantinya tabel `participants` tidak perlu diberi index
 * baru. Menambah index di tabel yang sudah dipakai alur booth dan kasir adalah
 * risiko yang tidak sebanding dengan keuntungannya di sini.
 */
async function loadParticipantsWithSeats(eventId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("participants")
    .select("id,name,company,title,allow_name_display,participant_type,source_checked_in,seats")
    .eq("event_id", eventId)
    .is("source_removed_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ParticipantRow[];
}

/**
 * Penempatan orang untuk satu sesi.
 *
 * `subEventId` yang dipakai sebagai kunci, bukan nama sesi: nama bisa diubah
 * panitia kapan saja, sedangkan id semestinya stabil. Selama admin belum
 * memilih `sub_event_id`, hasilnya sengaja kosong daripada menampilkan
 * penempatan sesi pagi di denah sesi malam.
 */
export async function loadAssignmentsForSession(eventId: string, subEventId: string | null) {
  const participants = await loadParticipantsWithSeats(eventId);
  const assignments: SeatAssignment[] = [];
  let participantsWithoutSeat = 0;

  for (const participant of participants) {
    const seats = Array.isArray(participant.seats) ? participant.seats : [];
    const matching = subEventId ? seats.filter((seat) => seat?.subEventId === subEventId) : [];

    if (matching.length === 0) {
      participantsWithoutSeat += 1;
      continue;
    }

    for (const seat of matching) {
      if (typeof seat.label !== "string" || !seat.label.trim()) continue;
      assignments.push({
        participantId: participant.id,
        name: participant.name,
        company: participant.company,
        title: participant.title,
        participantType: participant.participant_type,
        allowNameDisplay: participant.allow_name_display,
        checkedIn: participant.source_checked_in,
        seatLabel: seat.label,
        normalizedLabel: normalizeSeatLabel(seat.label),
      });
    }
  }

  return { assignments, participantsWithoutSeat, totalActiveParticipants: participants.length };
}

/**
 * Daftar sub-event yang benar-benar ada di data scanner API.
 *
 * Dipakai CMS supaya admin memilih sesi dari daftar, bukan menyalin id dengan
 * tangan. Satu salah ketik pada id berarti seluruh denah tampak kosong.
 */
export async function discoverSubEvents(eventId: string) {
  const participants = await loadParticipantsWithSeats(eventId);
  const found = new Map<string, { subEventId: string; subEventName: string; seatCount: number }>();

  for (const participant of participants) {
    const seats = Array.isArray(participant.seats) ? participant.seats : [];
    for (const seat of seats) {
      if (!seat || typeof seat.subEventId !== "string" || !seat.subEventId) continue;
      const existing = found.get(seat.subEventId);
      if (existing) existing.seatCount += 1;
      else
        found.set(seat.subEventId, {
          subEventId: seat.subEventId,
          subEventName: typeof seat.subEventName === "string" ? seat.subEventName : "(tanpa nama)",
          seatCount: 1,
        });
    }
  }

  return [...found.values()].sort((a, b) => b.seatCount - a.seatCount);
}
