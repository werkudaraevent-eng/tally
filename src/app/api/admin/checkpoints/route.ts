import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * CMS Check-in > Checkpoints (migrasi 202610140002).
 *
 * GET   setelan, daftar checkpoint, pilihan sesi dan barang, dan angkanya.
 * POST  checkpoint baru (di akhir daftar).
 * PATCH `{ id, ... }` mengubah satu checkpoint, `{ id, move }` memindahkannya
 *       satu langkah, `{ settings }` menyalakan fitur atau poin.
 * DELETE ?id= menghapus satu checkpoint. Catatan scan dan barangnya tidak
 *       tersentuh: checkpoint hanya menunjuk bukti itu.
 */

const teks = (max: number) => z.string().trim().max(max).nullish().transform((nilai) => nilai || null);

const isiSchema = z.object({
  title: z.string().trim().min(1).max(80),
  title_en: teks(80),
  place: teks(120),
  place_en: teks(120),
  session_id: z.number().int().positive().nullish(),
  item_id: z.number().int().positive().nullish(),
  points: z.number().int().min(0).max(10000).nullish(),
});

const patchSchema = z.union([
  z.object({ settings: z.object({ enabled: z.boolean().optional(), points_enabled: z.boolean().optional() }) }),
  z.object({ id: z.number().int().positive(), move: z.enum(["up", "down"]) }),
  isiSchema.extend({ id: z.number().int().positive() }),
]);

const PILIH = "id,title,title_en,place,place_en,session_id,item_id,points,sort_order";

/** Galat database menjadi kalimat yang bisa ditindaklanjuti admin. */
function galat(error: { code?: string; message?: string }) {
  const kode = String(error.code ?? "");
  if (kode === "23503") return apiError("VALIDATION_ERROR", 422, { message: "That session or kit item no longer exists. Reload the page." });
  if (kode === "23514") return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  // Tabel belum ada: migrasi belum dijalankan di database ini.
  if (kode === "42P01" || kode === "PGRST205") return apiError("VALIDATION_ERROR", 503, { message: "Checkpoints are not set up in the database yet." });
  return apiError("INTERNAL_ERROR", 500);
}

/** Tepat satu bukti: sesi scan ATAU barang. */
function satuBukti(isi: { session_id?: number | null; item_id?: number | null }) {
  return Boolean(isi.session_id) !== Boolean(isi.item_id);
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();

  const [setelan, daftar, sesi, barang, angka] = await Promise.all([
    db.from("checkpoint_settings").select("enabled,points_enabled").eq("event_id", eventId).maybeSingle(),
    db.from("checkpoints").select(PILIH).eq("event_id", eventId).order("sort_order").order("id"),
    db.from("attendance_sessions").select("id,name,is_active").eq("event_id", eventId).order("sort_order").order("id"),
    db.from("pickup_items").select("id,name").eq("event_id", eventId).order("sort_order").order("id"),
    db.rpc("checkpoint_progress" as never, { p_event_id: eventId } as never),
  ]);
  if (setelan.error || daftar.error) return galat(setelan.error ?? daftar.error!);
  if (sesi.error || barang.error) return apiError("INTERNAL_ERROR", 500);

  const s = setelan.data as { enabled: boolean; points_enabled: boolean } | null;
  const progres = (angka.error ? null : angka.data) as { done?: Record<string, number>; finished_all?: number; participants?: number } | null;
  return Response.json({
    settings: { enabled: s?.enabled === true, points_enabled: s?.points_enabled === true },
    checkpoints: ((daftar.data ?? []) as { id: number }[]).map((cp) => ({ ...cp, done: progres?.done?.[String(cp.id)] ?? 0 })),
    sessions: sesi.data ?? [],
    items: barang.data ?? [],
    finished_all: progres?.finished_all ?? null,
    participants: progres?.participants ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = isiSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!satuBukti(parsed.data)) return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();

  const { data: akhir } = await db.from("checkpoints").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from("checkpoints")
    .insert({ ...parsed.data, session_id: parsed.data.session_id ?? null, item_id: parsed.data.item_id ?? null, event_id: eventId, sort_order: ((akhir as { sort_order: number } | null)?.sort_order ?? -1) + 1 } as never)
    .select(PILIH)
    .single();
  if (error) return galat(error);
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const eventId = auth.scope.event.id;
  const db = getSupabaseServiceClient();
  const sekarang = new Date().toISOString();

  if ("settings" in parsed.data) {
    const { data: lama, error: galatBaca } = await db.from("checkpoint_settings").select("enabled,points_enabled").eq("event_id", eventId).maybeSingle();
    if (galatBaca) return galat(galatBaca);
    const awal = (lama as { enabled: boolean; points_enabled: boolean } | null) ?? { enabled: false, points_enabled: false };
    const baru = { ...awal, ...parsed.data.settings };
    const { error } = await db.from("checkpoint_settings").upsert({ event_id: eventId, ...baru, updated_at: sekarang } as never, { onConflict: "event_id" });
    if (error) return galat(error);
    return Response.json({ settings: baru });
  }

  if ("move" in parsed.data) {
    // Seluruh urutan ditulis ulang 0..n-1 dari urutan yang tampil, jadi nilai
    // sort_order yang kembar atau berlubang ikut rapi.
    const { data: semua, error: galatBaca } = await db.from("checkpoints").select("id").eq("event_id", eventId).order("sort_order").order("id");
    if (galatBaca) return galat(galatBaca);
    const ids = ((semua ?? []) as { id: number }[]).map((cp) => cp.id);
    const dari = ids.indexOf(parsed.data.id);
    const ke = dari + (parsed.data.move === "up" ? -1 : 1);
    if (dari < 0) return apiError("VALIDATION_ERROR", 404, { message: "This checkpoint no longer exists. Reload the page." });
    if (ke < 0 || ke >= ids.length) return Response.json({ ok: true });
    [ids[dari], ids[ke]] = [ids[ke], ids[dari]];
    const hasil = await Promise.all(
      ids.map((id, urutan) => db.from("checkpoints").update({ sort_order: urutan, updated_at: sekarang } as never).eq("id", id).eq("event_id", eventId)),
    );
    if (hasil.some((h) => h.error)) return apiError("INTERNAL_ERROR", 500);
    return Response.json({ ok: true });
  }

  const { id, ...isi } = parsed.data;
  if (!satuBukti(isi)) return apiError("VALIDATION_ERROR", 422, { message: "Pick exactly one: a scan session or a kit item." });
  const { data, error } = await db
    .from("checkpoints")
    .update({ ...isi, session_id: isi.session_id ?? null, item_id: isi.item_id ?? null, updated_at: sekarang } as never)
    // event_id ikut disaring: id checkpoint acara lain tidak bisa diubah dari sini.
    .eq("id", id)
    .eq("event_id", eventId)
    .select(PILIH)
    .maybeSingle();
  if (error) return galat(error);
  if (!data) return apiError("VALIDATION_ERROR", 404, { message: "This checkpoint no longer exists. Reload the page." });
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);
  const { error } = await getSupabaseServiceClient().from("checkpoints").delete().eq("id", id).eq("event_id", auth.scope.event.id);
  if (error) return galat(error);
  return Response.json({ ok: true });
}
