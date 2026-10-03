import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Barang yang diperiksa di tiap sesi scan.
 *
 * Barangnya sendiri (Kaos, Goodie bag) dibuat di Logistik, tab Barang. Di sini
 * hanya pasangannya: sesi Registrasi memeriksa Kaos dan Goodie bag, sesi Gala
 * dinner tidak memeriksa apa pun. Satu barang boleh di beberapa sesi dan tetap
 * hanya bisa diambil sekali per peserta (`item_pickups_unique`).
 */
const schema = z.object({
  session_id: z.number().int().positive(),
  item_ids: z.array(z.number().int().positive()).max(30),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const client = getSupabaseServiceClient();

  const [items, links] = await Promise.all([
    client.from("pickup_items").select("id,name,size_field_key").eq("event_id", auth.scope.event.id).order("sort_order").order("id"),
    client.from("attendance_session_items").select("session_id,item_id").eq("event_id", auth.scope.event.id).order("sort_order"),
  ]);
  if (items.error || links.error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ items: items.data ?? [], links: links.data ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  // Diganti seluruhnya: daftar centang di layar admin adalah keadaan akhirnya.
  // Catatan penyerahan (`item_pickups`) tidak tersentuh, karena barang yang
  // sudah dibawa pulang tetap sudah dibawa pulang walau sesinya berhenti
  // memeriksanya.
  const hapus = await client.from("attendance_session_items").delete()
    .eq("event_id", eventId).eq("session_id", parsed.data.session_id);
  if (hapus.error) return apiError("INTERNAL_ERROR", 500);

  const unik = [...new Set(parsed.data.item_ids)];
  if (unik.length > 0) {
    const { error } = await client.from("attendance_session_items").insert(
      unik.map((itemId, urutan) => ({ event_id: eventId, session_id: parsed.data.session_id, item_id: itemId, sort_order: urutan })) as never,
    );
    // FK komposit menolak sesi atau barang milik acara lain.
    if (error) {
      if (String(error.code) === "23503") {
        return apiError("VALIDATION_ERROR", 422, { message: "Sesi atau barangnya sudah tidak ada. Muat ulang halaman." });
      }
      return apiError("INTERNAL_ERROR", 500);
    }
  }
  return Response.json({ item_ids: unik });
}
