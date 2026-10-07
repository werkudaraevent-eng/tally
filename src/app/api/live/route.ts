import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Data pendaftaran untuk akun Viewer (klien), dibaca ulang tiap 30 detik.
 *
 * Endpoint sendiri, bukan /api/admin/participants yang dibuka untuk viewer:
 * route admin itu juga melayani POST, impor, dan detail baris lengkap (extra,
 * berkas unggahan, logistik). Membuka satu jalur admin untuk peran baca-saja
 * berarti setiap perubahan di jalur itu harus ingat peran ini. Di sini hanya
 * ada satu GET, dengan kolom yang memang boleh dilihat klien.
 *
 * Admin ikut diizinkan supaya panitia bisa melihat persis apa yang dilihat klien.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["registered_at", "name", "company"]).default("registered_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

type BarisRpc = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  registered_at: string | null;
  registered_via: "form" | "added";
  source_checked_in: boolean | null;
  source_removed_at: string | null;
  attendance: Record<string, { count: number; first: string }>;
};

/** Awal hari ini di zona acara, sebagai ISO. "Hari ini" klien adalah hari di lokasi acara. */
function awalHariIni(zona: ReturnType<typeof normalizeTimeZone>) {
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: zona });
  return new Date(`${tanggal}T00:00:00${timeZoneOffset(zona)}`).toISOString();
}

/** Orang yang sudah dipindai, dihitung per orang. Dibaca per 1000 karena PostgREST memotong di 1000. */
async function hitungHadir(eventId: string) {
  const client = getSupabaseServiceClient();
  const orang = new Set<string>();
  for (let dari = 0; dari < 100000; dari += 1000) {
    const { data, error } = await client
      .from("attendance_scans")
      .select("participant_id")
      .eq("event_id", eventId)
      .order("id")
      .range(dari, dari + 999);
    if (error || !data) break;
    for (const baris of data as Array<{ participant_id: string | null }>) if (baris.participant_id) orang.add(baris.participant_id);
    if (data.length < 1000) break;
  }
  return orang.size;
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["viewer", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  const zona = normalizeTimeZone(event.time_zone);
  const client = getSupabaseServiceClient();
  const peserta = () => client.from("participants").select("id", { head: true, count: "exact" }).eq("event_id", event.id).is("source_removed_at", null);

  const [daftar, total, hariIni, menunggu, hadir] = await Promise.all([
    client.rpc("list_event_participants" as never, {
      p_event_id: event.id,
      p_q: parsed.data.q,
      p_sort: parsed.data.sort,
      p_dir: parsed.data.dir,
      p_limit: parsed.data.limit,
      p_offset: parsed.data.offset,
    } as never),
    peserta(),
    peserta().gte("created_at", awalHariIni(zona)),
    client.from("event_registrations").select("id", { head: true, count: "exact" }).eq("event_id", event.id).eq("status", "pending"),
    hitungHadir(event.id),
  ]);
  if (daftar.error) return apiError("INTERNAL_ERROR", 500);

  const hasil = (daftar.data ?? { rows: [], total: 0 }) as { rows: BarisRpc[]; total: number };
  return Response.json(
    {
      event: { name: event.name, slug: event.slug, status: event.status, time_zone: zona },
      counts: {
        registered: total.count ?? 0,
        today: hariIni.count ?? 0,
        pending: menunggu.count ?? 0,
        checked_in: hadir,
      },
      // Hanya kolom yang dibutuhkan tabel klien. QR code, jawaban form
      // tambahan, dan berkas unggahan sengaja tidak ikut.
      rows: hasil.rows.map((baris) => ({
        id: baris.id,
        name: baris.name,
        company: baris.company,
        title: baris.title,
        email: baris.email,
        phone: baris.phone,
        participant_type: baris.participant_type,
        registered_at: baris.registered_at,
        registered_via: baris.registered_via,
        removed: Boolean(baris.source_removed_at),
        checked_in: Object.keys(baris.attendance ?? {}).length > 0 || Boolean(baris.source_checked_in),
      })),
      total: hasil.total,
      fetched_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
