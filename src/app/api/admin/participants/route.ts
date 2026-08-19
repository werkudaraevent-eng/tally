import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { participantBodySchema, toRpcArgs } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Whitelist kolom sort. Nama kolom TIDAK BOLEH diambil langsung dari query
// string ke .order(), karena itu membuka celah injeksi lewat parameter PostgREST.
const SORTABLE = {
  name: "name",
  qr_code: "qr_code",
  participant_type: "participant_type",
  rsvp_status: "rsvp_status",
  source_checked_in: "source_checked_in",
  source_total_scans: "source_total_scans",
} as const;

const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  // Admin tetap melihat peserta bertanda source_removed_at agar bisa diaudit;
  // booth dan kasir menyembunyikannya. Baris bertanda diberi flag agar UI dapat
  // menjelaskan kenapa total di sini bisa lebih besar dari dashboard sumber.
  // Sort dilakukan di server, bukan di klien: paginasi juga di server, jadi
  // mengurutkan 25 baris yang sedang tampil akan menghasilkan urutan yang salah.
  // Tiebreaker `name` menjaga urutan stabil saat kolom sort banyak nilai sama
  // (mis. rsvp_status), supaya baris tidak berpindah halaman antar-request.
  // `seats` ikut dikirim untuk ditampilkan saja. Sengaja tidak masuk SORTABLE:
  // mengurutkan jsonb tidak punya arti yang jelas bagi admin, dan penempatan
  // kursi tetap milik scanner API, bukan sesuatu yang diatur dari halaman ini.
  let query = client
    .from("participants")
    // `source_participant_id` ikut dikirim karena ia yang menentukan sel mana
    // yang boleh disunting di tabel. UI tidak boleh menebaknya dari
    // `source_synced_at`: peserta manual yang pernah ada di sumber lalu dihapus
    // tetap punya stempel sync, dan menebak dari situ mengunci baris yang
    // sebenarnya milik panitia.
    .select("id,qr_code,name,company,title,email,phone,participant_type,rsvp_status,source_participant_id,source_checked_in,source_total_scans,source_synced_at,source_removed_at,seats", { count: "exact" })
    .eq("event_id", eventId)
    .order(SORTABLE[parsed.data.sort], { ascending: parsed.data.dir === "asc", nullsFirst: false })
    .order("name", { ascending: true })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (parsed.data.q) query = query.or(`name.ilike.%${parsed.data.q}%,qr_code.ilike.%${parsed.data.q}%,company.ilike.%${parsed.data.q}%`);

  const [result, removed, latest] = await Promise.all([
    query,
    client.from("participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("source_removed_at", "is", null),
    client.from("participants").select("source_synced_at").eq("event_id", eventId).order("source_synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (result.error) return apiError("INTERNAL_ERROR", 500);

  const removedCount = removed.count ?? 0;
  const totalCount = result.count ?? 0;

  return Response.json({
    total: totalCount,
    active_total: totalCount - removedCount,
    removed_count: removedCount,
    last_synced_at: (latest.data as { source_synced_at: string | null } | null)?.source_synced_at ?? null,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    participants: result.data ?? [],
  });
}

/**
 * Tambah peserta manual.
 *
 * Barisnya dibuat tanpa `source_participant_id`, dan justru itulah yang membuat
 * sinkronisasi Scanner API tidak menyentuhnya: sapuan `source_removed_at`
 * menyaring `source_participant_id is not null`, dan upsert-nya memakai
 * conflict target `(event_id, source_participant_id)`.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = participantBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("save_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: null,
    ...toRpcArgs(body.data),
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }
  return Response.json({ participant: data }, { status: 201 });
}
