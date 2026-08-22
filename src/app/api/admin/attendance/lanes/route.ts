import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS jalur registrasi.
 *
 * Satu jalur = satu meja. Lima meja registrasi berdampingan adalah lima jalur,
 * semuanya melayani sesi "Registrasi" yang sama — bukan lima sesi. Kalau dibuat
 * sebagai sesi, jumlah hadir terpecah menjadi lima angka yang harus dijumlahkan
 * sendiri, dan tamu yang pindah antrean terhitung dua kali.
 */

const laneSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung."),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
});

const patchSchema = laneSchema.partial().extend({ id: z.number().int().positive() });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  const [jalur, scans] = await Promise.all([
    client
      .from("attendance_lanes")
      .select("id,name,slug,sort_order,is_active")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Hanya kolom jalur. Angka di sini menjawab "meja mana yang kebanjiran",
    // bukan siapa yang datang — itu sudah dijawab daftar hadir per sesi.
    client.from("attendance_scans").select("lane_id").eq("event_id", eventId).not("lane_id", "is", null),
  ]);

  if (jalur.error) return apiError("INTERNAL_ERROR", 500);

  const jumlah = new Map<number, number>();
  for (const scan of (scans.data ?? []) as Array<{ lane_id: number }>) {
    jumlah.set(scan.lane_id, (jumlah.get(scan.lane_id) ?? 0) + 1);
  }

  return Response.json({
    lanes: ((jalur.data ?? []) as Array<{ id: number }>).map((row) => ({
      ...row,
      total_scan: jumlah.get(row.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = laneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_lanes")
    .insert({ ...parsed.data, event_id: auth.scope.event.id } as never)
    .select("id,name,slug,sort_order,is_active")
    .single();

  if (error) {
    if (String(error.code) === "23505") {
      return apiError("VALIDATION_ERROR", 422, { slug: "Slug ini sudah dipakai jalur lain di acara yang sama." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_lanes")
    .update(patch as never)
    // event_id ikut disaring: nomor jalur milik acara lain tidak boleh bisa
    // diubah hanya karena angkanya ditempelkan ke permintaan ini.
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select("id,name,slug,sort_order,is_active")
    .single();

  if (error) {
    if (String(error.code) === "23505") {
      return apiError("VALIDATION_ERROR", 422, { slug: "Slug ini sudah dipakai jalur lain di acara yang sama." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();

  // Jalur yang sudah dipakai TIDAK dihapus, hanya bisa ditutup.
  //
  // Menghapusnya tidak menghilangkan catatan hadir — `on delete set null` hanya
  // mengosongkan kolom jalurnya — tetapi itu justru masalahnya: laporan "meja
  // mana yang kebanjiran jam sembilan" kehilangan datanya tanpa satu pun tanda
  // bahwa datanya pernah ada.
  const { count } = await client
    .from("attendance_scans")
    .select("id", { head: true, count: "exact" })
    .eq("lane_id", id)
    .eq("event_id", auth.scope.event.id);

  if ((count ?? 0) > 0) {
    return apiError("VALIDATION_ERROR", 422, {
      message: `Jalur ini sudah punya ${count} pemindaian. Tutup saja jalurnya — catatan mejanya ikut hilang kalau dihapus.`,
    });
  }

  const { error } = await client
    .from("attendance_lanes")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id);

  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}
