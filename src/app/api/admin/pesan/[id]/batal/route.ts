import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { idSchema } from "@/lib/pesan/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Batalkan kiriman terjadwal yang belum berangkat, atau sisa kiriman
 * Invitation yang dijeda. Kiriman yang sedang berjalan tidak bisa dibatalkan
 * dari sini.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const client = getSupabaseServiceClient();
  // Tanpa `.or(...)` dan tanpa `select` pada PATCH: PostgREST di bawah v14
  // menolak PATCH yang memadukan `or=` dengan `select=` (42703), dan menyaring
  // ulang baris hasilnya sehingga `select` bisa kosong padahal baris berubah.
  // Jadi: baca keadaan, perbarui dengan penjaga yang cocok, lalu baca ulang.
  const baca = () =>
    client.from("message_blasts").select("status,scheduled_at").eq("id", id).eq("event_id", auth.scope.event.id).maybeSingle();
  const { data: awal, error: galatAwal } = await baca();
  // Hanya tabel yang belum ada yang berarti migrasi pesan belum dijalankan.
  if (galatAwal?.code === "42P01" || galatAwal?.code === "PGRST205") return apiError("MESSAGES_NOT_READY", 409);
  if (galatAwal) return gagal(galatAwal);
  const kini = awal as { status: string; scheduled_at: string | null } | null;
  const terjadwal = kini?.status === "terjadwal" && kini.scheduled_at != null;
  if (!kini || (!terjadwal && kini.status !== "dijeda")) return apiError("MESSAGE_NOT_DRAFT", 409);
  let ubah = client
    .from("message_blasts")
    .update({ status: "dibatalkan", updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .eq("status", kini.status);
  if (terjadwal) ubah = ubah.not("scheduled_at", "is", null);
  const { error } = await ubah;
  if (error) return gagal(error);
  const { data: akhir, error: galatAkhir } = await baca();
  if (galatAkhir) return gagal(galatAkhir);
  // Berangkat atau dilanjutkan di antara baca dan perbarui: tidak dibatalkan.
  if ((akhir as { status: string } | null)?.status !== "dibatalkan") return apiError("MESSAGE_NOT_DRAFT", 409);
  // Tautan undangan kiriman ini tidak pernah terkirim: hapus, dan antreannya
  // ditutup supaya laporan tidak menampilkan "Antre" selamanya. Undangan lama
  // peserta tetap berlaku karena hanya dicabut saat undangan baru terkirim.
  await client.from("participant_account_tokens").delete().eq("blast_id", id).is("used_at", null);
  await client
    .from("message_blast_recipients")
    .update({ status: "dilewati", reason_code: "jadwal_dibatalkan", reason: "Kiriman dibatalkan", updated_at: new Date().toISOString() } as never)
    .eq("blast_id", id)
    .in("status", ["antre", "ditahan"]);
  await client.from("audit_logs").insert({ event_id: auth.scope.event.id, user_id: auth.user.id, action: "message_cancel", payload: { id } } as never);
  return Response.json({ ok: true });
}

function gagal(error: { code?: string; message?: string }) {
  console.error("[pesan] batal", error.code, error.message);
  return apiError("INTERNAL_ERROR", 500);
}
