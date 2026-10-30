import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { hapusFotoBagasi } from "@/lib/bagasi/server";
import { ringkasReset } from "@/lib/reset-check-in";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Reset check-in satu peserta, untuk uji coba yang diulang.
 *
 * GET              apa yang akan terhapus: pemindaian per sesi dan barang kit
 *                  yang diserahkan, supaya dialog konfirmasi menyebutnya.
 * DELETE ?session= satu sesi; tanpa `session` = semua sesi.
 *
 * Yang dihapus hanya buktinya: baris `attendance_scans` peserta itu di sesi
 * tersebut, dan `item_pickups` yang tercatat di sesi itu (tanpa `session`: semua
 * barang kitnya; sesi terakhir yang direset juga membawa barang dari sesi yang
 * sudah dihapus). Checkpoint, poin, kolom check-in di Export dan syarat undian
 * semuanya dihitung dari dua tabel ini, jadi ikut kembali tanpa langkah lain.
 * Pemenang undian yang sudah terundi tidak disentuh.
 *
 * Bagasi yang dititipkan di sesi itu (`luggage_drops`) ikut dihapus beserta
 * fotonya, sama seperti barang kit: catatan itu dibuat oleh scan yang direset,
 * dan uji coba meja bagasi yang diulang harus mulai dari nol.
 *
 * Isi barisnya disalin ke `audit_logs` SEBELUM dihapus, dan penghapusannya per
 * id: pemindaian yang masuk di antara keduanya (orangnya dipindai lagi) tetap
 * tersimpan, karena itu memang check-in baru.
 */

const paramsSchema = z.string().uuid();
// Hanya angka: `z.coerce` menerima "1e3" atau " 7 " sebagai id sesi.
const querySchema = z.object({ session: z.string().regex(/^[1-9]\d{0,15}$/).transform(Number).optional() });

type Scan = { id: number; session_id: number; scanned_at: string; scanned_by: string | null; method?: string | null };
type Pickup = { id: number; item_id: number; session_id: number | null; size: string | null; picked_up_at: string; picked_up_by: string | null };
type Bagasi = { id: number; session_id: number; bag_count: number; photo_path: string | null; recorded_at: string; recorded_by: string | null; handed_over_at?: string | null; handed_over_by?: string | null };

async function bacaBukti(eventId: string, participantId: string, sessionId: number | undefined) {
  const client = getSupabaseServiceClient();
  let scans = client.from("attendance_scans").select("*").eq("event_id", eventId).eq("participant_id", participantId);
  // select *: handed_over_at baru ada setelah migrasi 202610240001.
  let bagasi = client.from("luggage_drops").select("*").eq("event_id", eventId).eq("participant_id", participantId);
  let pickups = client.from("item_pickups").select("id,item_id,session_id,size,picked_up_at,picked_up_by").eq("event_id", eventId).eq("participant_id", participantId);
  // Barang dari sesi yang sudah dihapus tercatat dengan session_id null (on
  // delete set null). Ikut direset bersama check-in TERAKHIR peserta itu;
  // kalau tidak, setelah sesi terakhir direset tidak ada tombol yang bisa
  // mengembalikannya dan item_pickups_unique menahan penyerahan berikutnya.
  let sesiLain = 0;
  if (sessionId !== undefined) {
    const lain = await client.from("attendance_scans").select("id", { head: true, count: "exact" })
      .eq("event_id", eventId).eq("participant_id", participantId).neq("session_id", sessionId);
    if (lain.error) return null;
    sesiLain = lain.count ?? 0;
    scans = scans.eq("session_id", sessionId);
    bagasi = bagasi.eq("session_id", sessionId);
    pickups = sesiLain > 0 ? pickups.eq("session_id", sessionId) : pickups.or(`session_id.eq.${sessionId},session_id.is.null`);
  }
  // Satu orang: jauh di bawah batas 1.000 baris, kecuali dipindai beribu kali.
  const [s, p, items, b] = await Promise.all([
    scans.order("scanned_at", { ascending: true }).limit(1000),
    pickups.order("picked_up_at", { ascending: true }).limit(1000),
    client.from("pickup_items").select("id,name").eq("event_id", eventId).limit(1000),
    bagasi.order("recorded_at", { ascending: true }).limit(1000),
  ]);
  if (s.error || p.error || items.error || b.error) return null;
  return {
    scans: ((s.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as number,
      session_id: row.session_id as number,
      scanned_at: row.scanned_at as string,
      scanned_by: (row.scanned_by as string | null) ?? null,
      // Kolom `method` baru ada sejak 202610180001.
      method: (row.method as string | null | undefined) ?? null,
    })) as Scan[],
    pickups: (p.data ?? []) as Pickup[],
    luggage: (b.data ?? []) as Bagasi[],
    itemNames: new Map(((items.data ?? []) as Array<{ id: number; name: string }>).map((item) => [item.id, item.name])),
  };
}

async function muat(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return { response: auth.response } as const;
  const id = paramsSchema.safeParse((await context.params).id);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!id.success || !query.success) return { response: apiError("VALIDATION_ERROR", 422) } as const;

  const eventId = auth.scope.event.id;
  const { data: peserta, error } = await getSupabaseServiceClient()
    .from("participants").select("id,name").eq("event_id", eventId).eq("id", id.data).maybeSingle();
  if (error) return { response: apiError("INTERNAL_ERROR", 500) } as const;
  if (!peserta) return { response: apiError("PARTICIPANT_NOT_FOUND", 404) } as const;

  const sessionId = query.data.session;
  if (sessionId !== undefined) {
    const { data: sesi, error: galatSesi } = await getSupabaseServiceClient()
      .from("attendance_sessions").select("id").eq("event_id", eventId).eq("id", sessionId).maybeSingle();
    if (galatSesi) return { response: apiError("INTERNAL_ERROR", 500) } as const;
    if (!sesi) return { response: apiError("VALIDATION_ERROR", 422, { message: "This check-in point no longer exists. Reload the page." }) } as const;
  }

  const bukti = await bacaBukti(eventId, id.data, sessionId);
  if (!bukti) return { response: apiError("INTERNAL_ERROR", 500) } as const;
  return { auth, peserta: peserta as { id: string; name: string }, sessionId, bukti } as const;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const hasil = await muat(request, context);
  if ("response" in hasil) return hasil.response;
  // Bagasi bukan bagian dari peran kustom: pratinjaunya tidak ikut.
  const kustom = hasil.auth.scope.role === "custom";
  return Response.json({
    ...ringkasReset(hasil.bukti.scans, hasil.bukti.pickups, hasil.bukti.itemNames),
    luggage: kustom ? [] : hasil.bukti.luggage.map((row) => ({ session_id: row.session_id, bag_count: row.bag_count, photo: Boolean(row.photo_path) })),
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const hasil = await muat(request, context);
  if ("response" in hasil) return hasil.response;
  const { auth, peserta, sessionId, bukti } = hasil;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  if (bukti.scans.length === 0 && bukti.pickups.length === 0 && bukti.luggage.length === 0) return Response.json({ scans: 0, pickups: 0, luggage: 0 });

  // Audit dulu: kalau penulisannya gagal, tidak ada yang dihapus tanpa jejak.
  const { error: galatAudit } = await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "participant_check_in_reset",
    payload: {
      participant_id: peserta.id,
      participant_name: peserta.name,
      session_id: sessionId ?? null,
      scans: bukti.scans.map((row) => ({ session_id: row.session_id, scanned_at: row.scanned_at, scanned_by: row.scanned_by, method: row.method })),
      pickups: bukti.pickups.map((row) => ({ item_id: row.item_id, item: bukti.itemNames.get(row.item_id) ?? null, size: row.size, session_id: row.session_id, picked_up_at: row.picked_up_at, picked_up_by: row.picked_up_by })),
      luggage: bukti.luggage.map((row) => ({ session_id: row.session_id, bag_count: row.bag_count, photo: Boolean(row.photo_path), recorded_at: row.recorded_at, recorded_by: row.recorded_by, handed_over_at: row.handed_over_at ?? null, handed_over_by: row.handed_over_by ?? null })),
    },
  } as never);
  if (galatAudit) return apiError("INTERNAL_ERROR", 500);

  // Jumlah yang dikembalikan adalah yang benar-benar terhapus (`select`), bukan yang dibaca tadi.
  let scans = 0;
  let pickups = 0;
  if (bukti.scans.length > 0) {
    const { data, error: galat } = await client.from("attendance_scans").delete()
      .eq("event_id", eventId).eq("participant_id", peserta.id).in("id", bukti.scans.map((row) => row.id)).select("id");
    if (galat) return apiError("INTERNAL_ERROR", 500);
    scans = data?.length ?? 0;
  }
  if (bukti.pickups.length > 0) {
    const { data, error: galat } = await client.from("item_pickups").delete()
      .eq("event_id", eventId).eq("participant_id", peserta.id).in("id", bukti.pickups.map((row) => row.id)).select("id");
    if (galat) return apiError("INTERNAL_ERROR", 500, { message: `Scans were reset, but the kit hand-outs could not be. Try again.` });
    pickups = data?.length ?? 0;
  }
  let luggage = 0;
  if (bukti.luggage.length > 0) {
    const { data, error: galat } = await client.from("luggage_drops").delete()
      .eq("event_id", eventId).eq("participant_id", peserta.id).in("id", bukti.luggage.map((row) => row.id)).select("id");
    if (galat) return apiError("INTERNAL_ERROR", 500, { message: `Scans were reset, but the luggage record could not be. Try again.` });
    luggage = data?.length ?? 0;
    await hapusFotoBagasi(bukti.luggage.map((row) => row.photo_path));
  }
  return Response.json({ scans, pickups, luggage });
}
