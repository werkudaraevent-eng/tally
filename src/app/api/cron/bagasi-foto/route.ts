import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { BUCKET_BAGASI } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Penghapus foto bagasi: pg_cron memanggilnya sekali sehari lewat pg_net
 * (migrasi 202610230003), hanya bila ada foto dari acara yang selesai lebih
 * dari 30 hari lalu.
 *
 * Foto bagasi bisa memperlihatkan barang pribadi dan kadang orangnya. Setelah
 * acara ia tidak lagi menjawab pertanyaan apa pun ("koper saya mana?" sudah
 * terjawab di hari kedatangan), jadi tidak disimpan lebih lama dari perlu (UU
 * PDP: data pribadi disimpan sesuai tujuannya). Jumlahnya tetap disimpan.
 */

export const maxDuration = 60;

const HARI_SIMPAN = 30;
const PER_PUTARAN = 500;

function rahasiaCocok(request: Request) {
  const rahasia = process.env.CRON_SECRET;
  const diberikan = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!rahasia || diberikan.length !== rahasia.length) return false;
  return timingSafeEqual(Buffer.from(diberikan), Buffer.from(rahasia));
}

export async function POST(request: Request) {
  if (!rahasiaCocok(request)) return apiError("FORBIDDEN", 403);

  const db = getSupabaseServiceClient();
  const batas = new Date(Date.now() - HARI_SIMPAN * 86_400_000).toISOString().slice(0, 10);

  // Acara yang hari terakhirnya sebelum batas, dengan aturan yang sama dengan
  // job SQL. Acara tanpa tanggal tidak disentuh.
  const { data: acara, error: galatAcara } = await db
    .from("events")
    .select("id,event_date,end_date")
    .or(`end_date.lt.${batas},and(end_date.is.null,event_date.lt.${batas})`);
  if (galatAcara) return apiError("INTERNAL_ERROR", 500);
  const ids = ((acara ?? []) as Array<{ id: string }>).map((item) => item.id);
  if (ids.length === 0) return Response.json({ deleted: 0 });

  let dihapus = 0;
  for (let awal = 0; awal < ids.length && dihapus < PER_PUTARAN; awal += 100) {
    const { data, error } = await db
      .from("luggage_drops")
      .select("id,photo_path")
      .in("event_id", ids.slice(awal, awal + 100))
      .not("photo_path", "is", null)
      .limit(PER_PUTARAN - dihapus);
    if (error) return apiError("INTERNAL_ERROR", 500);
    const baris = (data ?? []) as Array<{ id: number; photo_path: string }>;
    if (baris.length === 0) continue;
    // Berkas dulu, baru barisnya: baris yang masih menunjuk berkas yang gagal
    // dihapus dicoba lagi besok; sebaliknya berkasnya yatim selamanya.
    const { error: galatHapus } = await db.storage.from(BUCKET_BAGASI).remove(baris.map((item) => item.photo_path));
    if (galatHapus) return apiError("INTERNAL_ERROR", 500);
    const { error: galatUbah } = await db
      .from("luggage_drops")
      .update({ photo_path: null } as never)
      .in("id", baris.map((item) => item.id));
    if (galatUbah) return apiError("INTERNAL_ERROR", 500);
    dihapus += baris.length;
  }
  return Response.json({ deleted: dihapus });
}
