import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { bahanKonfirmasi } from "@/lib/email/konfirmasi/konteks";
import { defaultTemplat, templatSchema, unknownFieldsIn } from "@/lib/email/konfirmasi/templat";
import { hitungBelumTerima } from "@/lib/email/konfirmasi/tertunda";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Editor email Konfirmasi pendaftaran (Pesan peserta > Email otomatis).
 *
 * GET mengembalikan templat (tersimpan atau bawaan), bahan pratinjau dari Tema
 * dan data acara, contoh pendaftar untuk "Pratinjau sebagai", dan jumlah
 * pendaftar disetujui yang belum pernah menerima email ber-QR. PUT menyimpan.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const bahan = await bahanKonfirmasi(event.id, new URL(request.url).origin);
  if (!bahan) return apiError("FORBIDDEN", 403);

  const { data: contoh } = await getSupabaseServiceClient()
    .from("event_registrations")
    .select("id,name,company,status")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return Response.json({
    templat: bahan.templat,
    bawaan: defaultTemplat({ punyaKv: Boolean(bahan.kvUrl), memberOn: bahan.memberOn }),
    tersimpan: bahan.tersimpan,
    kirim_menunggu: bahan.kirimMenunggu,
    dasar: bahan.dasar,
    kv_url: bahan.kvUrl,
    member_on: bahan.memberOn,
    contoh: contoh ?? [],
    belum_terima: await hitungBelumTerima(event.id),
    email_aktif: isEmailConfigured(),
  });
}

const putSchema = z.object({ templat: templatSchema, kirim_menunggu: z.boolean() });

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  // Kolom tak dikenal ditolak saat Simpan, sama seperti Kiriman: lebih baik
  // panitia membetulkannya sekarang daripada peserta menerima "{nmaa}".
  const asing = unknownFieldsIn(parsed.data.templat);
  if (asing.length) return apiError("VALIDATION_ERROR", 422, { fieldErrors: { templat: [`Kolom tidak dikenal: ${asing.map((key) => `{${key}}`).join(", ")}`] } });

  const event = auth.scope.event;
  const { data, error } = await getSupabaseServiceClient()
    .from("event_settings")
    .update({
      registration_email: parsed.data.templat,
      registration_email_pending: parsed.data.kirim_menunggu,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("event_id", event.id)
    .select("event_id");
  // Kolom belum ada = migrasi 202610030006 belum dijalankan.
  if (error) return error.code === "42703" || error.code === "PGRST204" ? apiError("EMAIL_TEMPLATE_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  if (!(data as unknown[] | null)?.length) return apiError("FORBIDDEN", 403);

  await getSupabaseServiceClient().from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "registration_email_template_update",
    payload: { preset: parsed.data.templat.preset, blocks: parsed.data.templat.blocks.length, kirim_menunggu: parsed.data.kirim_menunggu },
  } as never);
  return Response.json({ ok: true });
}
