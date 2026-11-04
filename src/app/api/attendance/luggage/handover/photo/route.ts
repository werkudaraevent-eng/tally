import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { BUCKET_BAGASI, hapusFotoSerahYatim, pathFotoBagasi, sesiAmbilBagasi, titipanPeserta } from "@/lib/bagasi/server";
import { jenisGambarDariIsi } from "@/lib/jenis-gambar";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Foto serah terima di meja ambil bagasi (Luggage: Pick-up > Photo at
 * hand-over, migrasi 202611040003).
 *
 * Datang SESUDAH penyerahan tersimpan (`/api/attendance/luggage/handover`),
 * sama dengan foto meja titip yang datang sesudah jumlahnya: jam dan nama
 * petugas tetap bukti utamanya, dan sinyal buruk paling-paling menghilangkan
 * fotonya. Foto menempel pada penyerahan TERAKHIR petugas ini untuk peserta
 * ini (satu tekan Hand over bisa mencakup titipan dari beberapa meja titip;
 * semuanya menunjuk berkas yang sama).
 *
 * Penjaga yang sama dengan foto meja titip: bucket privat, path dibuat server,
 * tipe dibaca dari isi berkas (JPEG dan WebP), batas 2 MB. Foto pengganti
 * menghapus foto lama bila tidak ada baris lain yang masih menunjuknya.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Baris = { id: number; handed_over_at: string | null; handover_photo_path?: string | null };

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const sessionId = Number(form?.get("session_id"));
  const participantId = String(form?.get("participant_id") ?? "");
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { file: "No photo was sent." });
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !UUID.test(participantId)) return apiError("VALIDATION_ERROR", 422);
  if (file.size === 0 || file.size > MAX_BYTES) return apiError("VALIDATION_ERROR", 422, { file: "The photo is larger than 2 MB." });

  const isi = Buffer.from(await file.arrayBuffer());
  const jenis = jenisGambarDariIsi(isi.subarray(0, 12));
  const ext = jenis ? ALLOWED.get(jenis) : undefined;
  if (!jenis || !ext) return apiError("VALIDATION_ERROR", 422, { file: "The photo must be a JPEG or WebP image." });

  const eventId = auth.scope.event.id;
  const sesi = await sesiAmbilBagasi(eventId, sessionId);
  if (!sesi) return apiError("VALIDATION_ERROR", 422, { message: "This check-in point does not hand back luggage, or it is closed." });
  if (!sesi.foto) return apiError("VALIDATION_ERROR", 422, { message: "Photos at hand-over are off for this check-in point." });

  const db = getSupabaseServiceClient();
  const participantKecil = participantId.toLowerCase();
  const { data, error: galatBaca } = await db
    .from("luggage_drops")
    .select("*")
    .eq("event_id", eventId)
    .eq("participant_id", participantKecil)
    .eq("handed_over_by", auth.user.id)
    .not("handed_over_at", "is", null);
  if (galatBaca) return apiError("INTERNAL_ERROR", 500);
  const milik = (data ?? []) as Baris[];
  const terakhir = milik.reduce<string | null>((maks, item) => (item.handed_over_at && (!maks || item.handed_over_at > maks) ? item.handed_over_at : maks), null);
  const sasaran = milik.filter((item) => item.handed_over_at === terakhir);
  if (!terakhir || sasaran.length === 0) return apiError("VALIDATION_ERROR", 422, { message: "Hand over the bags first." });

  const lama = sasaran.map((item) => item.handover_photo_path);
  const path = pathFotoBagasi(eventId, sessionId, participantKecil, ext);
  const { error: galatUnggah } = await db.storage.from(BUCKET_BAGASI).upload(path, isi, { contentType: jenis, upsert: false });
  if (galatUnggah) return apiError("INTERNAL_ERROR", 500);

  // `handed_over_by` ikut disaring: Undo di tengah jalan melepas barisnya, dan
  // foto tidak boleh menempel pada titipan yang sudah kembali ke rak (CHECK
  // database menolaknya juga). Tanpa `.select()`: PostgREST lama menjawab []
  // pada PATCH + select.
  const { error } = await db
    .from("luggage_drops")
    .update({ handover_photo_path: path } as never)
    .eq("event_id", eventId)
    .eq("participant_id", participantKecil)
    .eq("handed_over_by", auth.user.id)
    .in("id", sasaran.map((item) => item.id));
  if (error) {
    // Baris tidak menunjuknya: berkas ini yatim sejak detik pertama.
    await db.storage.from(BUCKET_BAGASI).remove([path]);
    return apiError("INTERNAL_ERROR", 500);
  }
  await hapusFotoSerahYatim(eventId, lama);

  try {
    return Response.json({ drops: await titipanPeserta(eventId, participantKecil, auth.user.id) });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
