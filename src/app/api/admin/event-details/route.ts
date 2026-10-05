import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Data dasar acara: nama, tanggal, zona waktu, tempat (dialog Edit details).
 *
 * Di bawah /api/admin, bukan di PATCH /api/events/[id], karena Admin acara itu
 * juga boleh memakainya: requireRequestEvent memberi pembatasan
 * user_event_access dan penjaga tulis Completed/Archived yang sama dengan
 * setiap layar admin lain. Perpindahan status tetap milik super_admin di sana.
 *
 * `slug` TIDAK PERNAH ditulis di sini. Mengganti nama acara tidak boleh
 * memutus satu pun tautan yang sudah tersebar.
 */

const patchSchema = z.object({
  name: z.string().trim().min(3).max(120),
  event_date: z.string().date().nullable(),
  time_zone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  venue_name: z.string().trim().max(160).nullable(),
  /** Geser hari-hari agenda sebanyak pergeseran tanggal acara. */
  shift_agenda: z.boolean().default(true),
});

const HARI_MS = 86_400_000;

function geserTanggal(iso: string, hari: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + hari * HARI_MS).toISOString().slice(0, 10);
}

/** Yang perlu diketahui dialog sebelum menyimpan: jumlah hari agenda dan nama publik. */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const { count } = await getSupabaseServiceClient()
    .from("rundown_sections")
    .select("id", { head: true, count: "exact" })
    .eq("event_id", event.id);
  const namaPublik = publicEventName(event);
  return Response.json({
    agenda_days: count ?? 0,
    public_name: namaPublik !== event.name ? namaPublik : null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const lama = auth.scope.event;
  const { shift_agenda, ...detail } = parsed.data;

  // Acara beberapa hari: tanggal akhir ikut bergeser supaya lamanya tetap.
  // Tanpa ini CHECK end_date >= event_date menolak acara yang dimundurkan,
  // dan acara yang dimajukan diam-diam jadi lebih panjang.
  const selisih = lama.event_date && detail.event_date
    ? Math.round((Date.parse(`${detail.event_date}T00:00:00Z`) - Date.parse(`${lama.event_date}T00:00:00Z`)) / HARI_MS)
    : 0;
  let endDate = lama.end_date;
  if (endDate && selisih !== 0) endDate = geserTanggal(endDate, selisih);
  if (!detail.event_date) endDate = null;
  if (endDate && detail.event_date && endDate < detail.event_date) endDate = null;

  const { data, error } = await client
    .from("events")
    .update({ ...detail, end_date: endDate, updated_at: new Date().toISOString() } as never)
    .eq("id", lama.id)
    .select()
    .single();
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  // Salinan lama zona waktu. events.time_zone adalah sumbernya; kolom ini
  // hanya dijaga sama untuk pembaca yang belum dipindahkan.
  await client.from("event_settings").update({ time_zone: detail.time_zone } as never).eq("event_id", lama.id);

  // Judul rundown lahir dari nama acara. Diganti hanya bila belum pernah diubah
  // sendiri oleh panitia, yaitu masih sama dengan nama lama.
  if (detail.name !== lama.name) {
    await client.from("rundown_settings").update({ event_title: detail.name } as never).eq("event_id", lama.id).eq("event_title", lama.name);
  }

  let agendaDigeser = 0;
  if (shift_agenda && selisih !== 0) {
    const { data: hari } = await client.from("rundown_sections").select("id,event_date").eq("event_id", lama.id);
    for (const baris of (hari ?? []) as Array<{ id: number; event_date: string }>) {
      const { error: galat } = await client
        .from("rundown_sections")
        .update({ event_date: geserTanggal(baris.event_date, selisih) } as never)
        .eq("id", baris.id)
        .eq("event_id", lama.id);
      if (!galat) agendaDigeser += 1;
    }
  }

  await client.from("audit_logs").insert({
    event_id: lama.id,
    user_id: auth.user.id,
    action: "event_edit",
    payload: { old: lama, new: data, agenda_days_shifted: agendaDigeser, shift_days: selisih },
  } as never);
  return Response.json({ event: data, agenda_days_shifted: agendaDigeser });
}
