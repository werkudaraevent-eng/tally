import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { cleanExtra, participantBodySchema, tanpaQr, toRpcArgs } from "@/lib/participant-input";
import { applyTallySeats, prepareTallySeats, SeatInputError } from "@/lib/seat-tally";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const paramsSchema = z.string().uuid();

/**
 * Sunting satu peserta.
 *
 * Penjaga "baris dari Scanner API tidak boleh diubah" TIDAK ditegakkan di sini,
 * melainkan di dalam `save_participant`. Diperiksa di route, ia hanya berlaku
 * untuk jalur ini; di dalam fungsi, impor massal dan jalur mana pun kelak ikut
 * terjaga oleh aturan yang sama. Route hanya menerjemahkan galatnya jadi pesan.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);
  const kustom = auth.scope.role === "custom";
  const client = getSupabaseServiceClient();
  const mentah = await request.json().catch(() => null);
  // Akun kustom tidak pernah melihat QR, jadi tidak bisa mengirimnya kembali:
  // QR yang tersimpan dipakai apa adanya, apa pun isi permintaannya.
  if (kustom && mentah && typeof mentah === "object") {
    const { data: lama } = await client.from("participants").select("qr_code,email").eq("id", id.data).eq("event_id", auth.scope.event.id).maybeSingle();
    const tersimpan = lama as { qr_code: string; email: string | null } | null;
    if (!tersimpan?.qr_code) return apiError("PARTICIPANT_NOT_FOUND", 404);
    (mentah as Record<string, unknown>).qr_code = tersimpan.qr_code;
    // Email adalah kunci masuk portal (kode email), dan portal menampilkan QR.
    // Akun kustom yang mengganti email peserta ke alamatnya sendiri bisa masuk
    // sebagai peserta itu (QA #341 M1), jadi emailnya tetap milik panitia.
    const rapi = (nilai: unknown) => (typeof nilai === "string" ? nilai.trim().toLowerCase() : "");
    const emailBaru = (mentah as Record<string, unknown>).email;
    if (emailBaru !== undefined && rapi(emailBaru) !== rapi(tersimpan.email)) {
      return apiError("FORBIDDEN", 403, { message: "Your role can't change a participant's email. Ask the organiser." });
    }
  }
  const body = participantBodySchema.safeParse(mentah);
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  // Jawaban berkas yang sudah tersimpan dibaca dulu supaya tidak ikut terhapus:
  // modal sunting tidak bisa menuliskannya kembali, dan penyimpanan yang
  // menghilangkan KTP pendaftar tanpa ada yang menyentuhnya adalah bug yang
  // baru ketahuan di meja registrasi.
  let existing: Record<string, string> = {};
  if (body.data.extra !== undefined) {
    const { data: row } = await client.from("participants").select("extra").eq("id", id.data).eq("event_id", auth.scope.event.id).maybeSingle();
    existing = ((row as { extra: Record<string, string> | null } | null)?.extra) ?? {};
  }
  const { issues, clean } = cleanExtra(auth.scope.event.registration_form_config as RegistrationFormConfig | null, body.data.extra, existing);
  if (issues.length > 0) {
    return apiError("VALIDATION_ERROR", 422, Object.fromEntries(issues.map((issue) => [`extra.${issue.key}`, issue.message])));
  }

  // Kursi diperiksa sebelum apa pun ditulis: label salah ketik ditolak tanpa
  // menyisakan peserta yang sudah tersimpan setengah.
  let kursi: Awaited<ReturnType<typeof prepareTallySeats>> = [];
  try {
    kursi = await prepareTallySeats(auth.scope.event.id, id.data, body.data.seats ?? []);
  } catch (galat) {
    if (galat instanceof SeatInputError) return apiError("VALIDATION_ERROR", 422, { seats: galat.message });
    throw galat;
  }

  const { data, error } = await client.rpc("save_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: id.data,
    ...toRpcArgs(body.data, clean),
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "PARTICIPANT_NOT_FOUND" ? 404 : 422);
  }
  try {
    const { freed } = await applyTallySeats(auth.scope.event.id, id.data, kursi, auth.user.id);
    return Response.json({ participant: kustom && data && typeof data === "object" ? tanpaQr(data) : data, freed });
  } catch {
    return apiError("INTERNAL_ERROR", 500, { seats: "Participant saved, but the seat wasn't. Try saving again." });
  }
}

/**
 * Hapus peserta manual.
 *
 * Tanpa dialog ketik-ulang seperti penghapusan event: yang hilang adalah satu
 * baris tanpa transaksi (penjaga di RPC menolak selebihnya), dan panitia dapat
 * mengetiknya kembali dalam sepuluh detik. Konfirmasi berlapis untuk tindakan
 * yang murah dipulihkan hanya melatih orang menekan "ya" tanpa membaca.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await getSupabaseServiceClient().rpc("delete_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: id.data,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "PARTICIPANT_NOT_FOUND" ? 404 : 422);
  }
  return Response.json(data);
}
