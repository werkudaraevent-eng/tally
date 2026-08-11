import { getSupabaseServiceClient } from "./service";
import type { EventRow, EventStatus, ParticipantSource, EventTimeZoneCode } from "../domain";

/**
 * Operasi data untuk registry event.
 *
 * Semua fungsi di sini berjalan dengan service client, sama seperti seluruh
 * jalur data repo ini. Otorisasi TIDAK dilakukan di sini -- itu tugas
 * `requireEventScope` di src/lib/auth/event-scope.ts. Menaruh pemeriksaan izin
 * di dua tempat membuat salah satunya cepat atau lambat tertinggal saat diubah.
 */

const EVENT_COLUMNS =
  "id,slug,name,description,event_date,status,participant_source,scanner_api_event_slug,registration_enabled,registration_form_config,time_zone,created_at,updated_at,archived_at";

/** Bentuk slug yang sah, harus sama dengan CHECK events_slug_format di DB. */
export const EVENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

export type EventListFilters = {
  status?: EventStatus | EventStatus[];
  includeArchived?: boolean;
};

export async function listEvents(filters?: EventListFilters): Promise<EventRow[]> {
  const supabase = getSupabaseServiceClient();

  let query = supabase.from("events").select(EVENT_COLUMNS);

  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    query = query.in("status", statuses);
  } else if (!filters?.includeArchived) {
    // Arsip disembunyikan lewat status, bukan lewat archived_at, agar hasilnya
    // tidak pernah berbeda dari filter status yang dipakai di tempat lain.
    // CHECK events_archived_consistent menjamin keduanya selalu sejalan.
    query = query.neq("status", "archived");
  }

  const { data, error } = await query
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Gagal memuat daftar event: ${error.message}`);
  return (data as EventRow[] | null) ?? [];
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Gagal memuat event: ${error.message}`);
  return (data as EventRow | null) ?? null;
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Gagal memuat event: ${error.message}`);
  return (data as EventRow | null) ?? null;
}

export type CreateEventInput = {
  slug: string;
  name: string;
  description?: string | null;
  event_date?: string | null;
  status?: EventStatus;
  participant_source?: ParticipantSource;
  scanner_api_event_slug?: string | null;
  registration_enabled?: boolean;
  time_zone?: EventTimeZoneCode;
  created_by?: string | null;
};

export async function createEvent(input: CreateEventInput): Promise<EventRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("events")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      event_date: input.event_date ?? null,
      // Bawaan 'draft', bukan 'active'. Event baru selalu punya konfigurasi
      // kosong (belum ada booth, belum ada peserta); membuatnya langsung aktif
      // berarti ia ikut muncul sebagai kandidat di jalur publik tanpa slug.
      status: input.status ?? "draft",
      participant_source: input.participant_source ?? "manual",
      scanner_api_event_slug: input.scanner_api_event_slug ?? null,
      registration_enabled: input.registration_enabled ?? false,
      time_zone: input.time_zone ?? "WIB",
      created_by: input.created_by ?? null,
    } as never)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Gagal membuat event: ${error.message}`);
  return data as EventRow;
}

export type UpdateEventInput = Partial<{
  name: string;
  description: string | null;
  event_date: string | null;
  status: EventStatus;
  participant_source: ParticipantSource;
  scanner_api_event_slug: string | null;
  registration_enabled: boolean;
  time_zone: EventTimeZoneCode;
}>;

/**
 * `slug` sengaja TIDAK bisa diubah: ia sudah tercetak di QR dan tersimpan di
 * bookmark LED. Mengubahnya mematikan semua tautan itu tanpa peringatan.
 */
export async function updateEvent(eventId: string, updates: UpdateEventInput): Promise<EventRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("events")
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq("id", eventId)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Gagal memperbarui event: ${error.message}`);
  return data as EventRow;
}

export async function archiveEvent(eventId: string, archivedBy: string): Promise<EventRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("events")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw new Error(`Gagal mengarsipkan event: ${error.message}`);
  return data as EventRow;
}

/**
 * Membuat slug unik dari nama.
 *
 * Nama non-ASCII bisa habis tersaring dan menyisakan string kosong, karena itu
 * ada fallback "event". Angka urut dipakai kalau slug sudah ada, dan cap waktu
 * dipakai kalau angka urut pun habis -- tanpa itu fungsi ini bisa mengembalikan
 * slug yang sudah dipakai dan insert-nya gagal di depan pengguna.
 */
export async function generateEventSlug(name: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/g, "") || "event";

  // Slug minimal 3 karakter agar lolos CHECK events_slug_format.
  const seed = base.length >= 3 ? base : `${base}-event`.slice(0, 50);

  const { data: taken, error } = await supabase
    .from("events")
    .select("slug")
    .like("slug", `${seed}%`);

  if (error) throw new Error(`Gagal memeriksa slug: ${error.message}`);

  const used = new Set(((taken as { slug: string }[] | null) ?? []).map((r) => r.slug));
  if (!used.has(seed)) return seed;

  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${seed}-${n}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${seed}-${Date.now().toString(36)}`;
}
