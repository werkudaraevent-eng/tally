import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { generateEventSlug } from "@/lib/supabase/events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { EventRow } from "@/lib/domain";

const paramsSchema = z.string().uuid();
const bodySchema = z.object({
  name: z.string().trim().min(3).max(120),
  event_date: z.string().date().nullable().optional(),
  // Slug Scanner API TIDAK diwarisi dari event sumber: salinan akan menarik
  // peserta acara LAIN setiap 5 menit lewat cron, tanpa ada yang meminta.
  // Panitia harus menyebutnya secara sadar untuk acara yang benar.
  scanner_api_event_slug: z.string().trim().min(1).max(120).nullable().optional(),
});

/**
 * Duplikasi event.
 *
 * Seluruh penyalinan terjadi di dalam satu RPC (`duplicate_event`), bukan di
 * sini. Alasannya transaksi: event salinan yang punya booth tapi kehilangan
 * penawaran spesialnya terlihat siap dipakai, dan kesalahannya baru muncul saat
 * peserta pertama menebus item di lapangan. Rangkaian panggilan dari route
 * handler tidak bisa menjamin itu tidak terjadi.
 *
 * Route ini hanya bertugas: memeriksa izin, menyiapkan slug unik, dan
 * menerjemahkan galat DB jadi pesan yang bisa ditindaklanjuti.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // super_admin saja, sama seperti membuat dan mengaktifkan event. Duplikasi
  // membuat workspace baru yang berdiri sendiri, bukan mengubah isi satu event.
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;

  const id = paramsSchema.safeParse((await context.params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) {
    return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());
  }

  const client = getSupabaseServiceClient();
  const { data: sumber } = await client.from("events").select("id,name").eq("id", id.data).maybeSingle();
  if (!sumber) return apiError("VALIDATION_ERROR", 404, { message: "Event sumber tidak ditemukan." });

  try {
    const { data, error } = await client.rpc("duplicate_event" as never, {
      p_source_event_id: id.data,
      p_slug: await generateEventSlug(body.data.name),
      p_name: body.data.name,
      p_event_date: body.data.event_date ?? null,
      p_actor: auth.user.id,
      p_scanner_slug: body.data.scanner_api_event_slug ?? null,
    } as never);
    if (error) return apiError("INTERNAL_ERROR", 500, { message: error.message });
    return Response.json({ event: data as EventRow }, { status: 201 });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
