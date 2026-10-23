import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { BUCKET_BAGASI, catatanBagasiStaf, sesiBagasi } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Foto bagasi dari layar pemindai.
 *
 * Datang SESUDAH jumlahnya tersimpan (`/api/attendance/luggage`): tanpa baris
 * jumlah, foto ditolak. Dengan begitu foto tidak pernah menjadi satu-satunya
 * bukti, dan sinyal buruk paling-paling menghilangkan fotonya.
 *
 * Penjaga yang sama dengan unggahan formulir pendaftaran: bucket privat, path
 * dibuat server (nama berkas dari ponsel tidak dipakai), daftar tipe tertutup
 * (JPEG dan WebP saja; ponsel mengecilkan ke JPEG sebelum mengirim), dan batas
 * ukuran. Foto pengganti menghapus foto lama setelah barisnya menunjuk yang baru.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const sessionId = Number(form?.get("session_id"));
  const participantId = String(form?.get("participant_id") ?? "");

  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { file: "No photo was sent." });
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !UUID.test(participantId)) return apiError("VALIDATION_ERROR", 422);
  const ext = ALLOWED.get(file.type);
  if (!ext) return apiError("VALIDATION_ERROR", 422, { file: "The photo must be a JPEG or WebP image." });
  if (file.size === 0 || file.size > MAX_BYTES) return apiError("VALIDATION_ERROR", 422, { file: "The photo is larger than 2 MB." });

  const eventId = auth.scope.event.id;
  if (!(await sesiBagasi(eventId, sessionId))) {
    return apiError("VALIDATION_ERROR", 422, { message: "This check-in point does not record luggage, or it is closed." });
  }

  const db = getSupabaseServiceClient();
  const { data: baris, error: galatBaca } = await db
    .from("luggage_drops")
    .select("id,photo_path")
    .eq("event_id", eventId)
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (galatBaca) return apiError("INTERNAL_ERROR", 500);
  if (!baris) return apiError("VALIDATION_ERROR", 422, { message: "Save the number of bags first." });

  const lama = (baris as { id: number; photo_path: string | null }).photo_path;
  const path = `${eventId}/${sessionId}/${participantId.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const { error: galatUnggah } = await db.storage
    .from(BUCKET_BAGASI)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (galatUnggah) return apiError("INTERNAL_ERROR", 500);

  const { error } = await db
    .from("luggage_drops")
    .update({ photo_path: path, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("id", (baris as { id: number }).id)
    .eq("event_id", eventId);
  if (error) {
    // Baris tidak menunjuknya: berkas ini yatim sejak detik pertama.
    await db.storage.from(BUCKET_BAGASI).remove([path]);
    return apiError("INTERNAL_ERROR", 500);
  }
  if (lama) await db.storage.from(BUCKET_BAGASI).remove([lama]);

  try {
    return Response.json({ luggage: await catatanBagasiStaf(eventId, sessionId, participantId) });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
