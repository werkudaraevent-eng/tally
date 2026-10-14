import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { SECTION_COLUMNS } from "@/lib/rundown";
import { bandingkanBagian, susunUlangBagian } from "@/lib/rundown-urutan";

// Urutan bagian (tab) rundown. Admin saja.
//
// Klien mengirim seluruh id bagian acara dalam urutan barunya, sama seperti
// susun ulang baris: server menolak susunan dari data basi (bagian ditambah
// atau dihapus di tab lain) alih-alih menebak maksudnya. Klien juga mengirim
// urutan yang ia lihat sebelum menggeser (`expected`); bila urutan di server
// sudah berbeda (admin lain baru menyusun ulang), permintaan ditolak 409 supaya
// dua susunan tidak bercampur menjadi urutan yang tidak dipilih siapa pun.

const idList = z.array(z.number().int().positive()).min(2).max(200);
const orderSchema = z.object({ ids: idList, expected: idList });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: rows, error: readError } = await client
    .from("rundown_sections")
    .select("id,event_id,slug,name,title,event_date,sort_order")
    .eq("event_id", eventId);
  if (readError) return apiError("INTERNAL_ERROR", 500);

  type Baris = { id: number; event_id: string; slug: string; name: string; title: string; event_date: string; sort_order: number };
  const baris = (rows ?? []) as unknown as Baris[];
  const perubahan = susunUlangBagian(baris, parsed.data.ids);
  if (!perubahan) {
    return apiError("VALIDATION_ERROR", 422, { message: "Sections were added or deleted elsewhere. The latest tabs are shown; check the order and try again." });
  }
  const sekarang = [...baris].sort(bandingkanBagian).map((row) => row.id);
  if (sekarang.length !== parsed.data.expected.length || sekarang.some((id, index) => id !== parsed.data.expected[index])) {
    return apiError("CONFLICT", 409, { message: "The tab order was changed in another window. The latest order is shown; try again if needed." });
  }

  // Satu pernyataan untuk semua bagian yang berubah, supaya urutan tidak
  // tertulis setengah bila gagal di tengah. Upsert per id membawa kolom wajib
  // baris yang baru dibaca; yang benar-benar berubah hanya sort_order.
  if (perubahan.length > 0) {
    const perId = new Map(baris.map((row) => [row.id, row]));
    const waktu = new Date().toISOString();
    const { error } = await client
      .from("rundown_sections")
      .upsert(
        perubahan.map((row) => {
          const lama = perId.get(row.id)!;
          return { id: lama.id, event_id: lama.event_id, slug: lama.slug, name: lama.name, title: lama.title, event_date: lama.event_date, sort_order: row.sort_order, updated_at: waktu, updated_by: auth.user.id };
        }) as never,
        { onConflict: "id" },
      );
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  if (perubahan.length > 0) {
    await client.from("audit_logs").insert({
      event_id: eventId,
      user_id: auth.user.id,
      action: "rundown_section_reorder",
      payload: { ids: parsed.data.ids, changes: perubahan },
    } as never);
  }

  const { data: sections, error } = await client
    .from("rundown_sections")
    .select(SECTION_COLUMNS)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ sections });
}
