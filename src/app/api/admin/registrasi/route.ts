import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(300).optional().nullable(),
});

const configSchema = z.object({
  registration_enabled: z.boolean(),
  registration_auto_approve: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  let query = client
    .from("event_registrations")
    .select("id,name,email,phone,company,job_title,extra,status,reject_reason,created_at,reviewed_at,participant_id,email_sent_at,email_error,email_attempts", { count: "exact" })
    .eq("event_id", eventId)
    // Terlama di ATAS. Antrean moderasi bukan linimasa: yang sudah menunggu
    // paling lama harus dikerjakan lebih dulu, dan urutan terbaru-di-atas
    // membuat pendaftar pertama terdorong ke halaman belakang setiap kali ada
    // yang mendaftar.
    .order("created_at", { ascending: true })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (parsed.data.status !== "all") query = query.eq("status", parsed.data.status);

  const [result, menunggu, konfigurasi] = await Promise.all([
    query,
    client.from("event_registrations").select("id", { head: true, count: "exact" })
      .eq("event_id", eventId).eq("status", "pending"),
    // `registration_auto_approve` sengaja TIDAK ditambahkan ke EVENT_COLUMNS:
    // kolom itu hanya dipakai halaman ini, sedangkan EVENT_COLUMNS ikut di
    // setiap resolusi event di seluruh aplikasi.
    client.from("events").select("registration_auto_approve").eq("id", eventId).single(),
  ]);
  if (result.error) return apiError("INTERNAL_ERROR", 500);

  // Kode peserta ikut dikirim untuk baris yang sudah disetujui. Tetap dikirim
  // meskipun email sudah aktif: email bisa masuk spam, salah ketik, atau
  // ditolak server penerima, dan panitia harus tetap bisa membacakan kodenya
  // lewat telepon tanpa membuka database. Diambil terpisah, bukan lewat join:
  // PostgREST butuh relasi terdaftar, dan `participant_id` sengaja
  // `on delete set null` sehingga barisnya bisa saja sudah tidak ada.
  const rows = (result.data ?? []) as Array<{ participant_id: string | null }>;
  const ids = rows.map((row) => row.participant_id).filter((id): id is string => id !== null);
  let kode = new Map<string, string>();
  if (ids.length > 0) {
    const { data: peserta } = await client.from("participants").select("id,qr_code").in("id", ids);
    kode = new Map(((peserta as Array<{ id: string; qr_code: string }> | null) ?? []).map((p) => [p.id, p.qr_code]));
  }

  return Response.json({
    registrations: rows.map((row) => ({
      ...row,
      qr_code: row.participant_id ? kode.get(row.participant_id) ?? null : null,
    })),
    total: result.count ?? 0,
    pending: menunggu.count ?? 0,
    event: {
      registration_enabled: auth.scope.event.registration_enabled,
      registration_auto_approve: (konfigurasi.data as { registration_auto_approve: boolean } | null)?.registration_auto_approve ?? false,
      participant_source: auth.scope.event.participant_source,
      slug: auth.scope.event.slug,
    },
    // Dibaca dari env, bukan dari data. Layar moderasi memakainya untuk memilih
    // antara "belum terkirim, coba lagi" (yang menyuruh panitia bertindak) dan
    // "pengiriman email belum diaktifkan" (yang menyuruh panitia berhenti
    // menekan tombol dan menghubungi pemilik sistem).
    email_configured: isEmailConfigured(),
  });
}

/**
 * Buka/tutup pendaftaran dan atur mode persetujuan.
 *
 * `registration_auto_approve` TIDAK dibaca lewat requireRequestEvent (kolom itu
 * tidak ada di EVENT_COLUMNS), jadi nilainya diambil dari baris hasil update —
 * satu-satunya sumber yang pasti sama dengan isi database.
 */
export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  // CHECK `events_registration_source` menolak registration_enabled = true saat
  // sumbernya bukan public_form/hybrid, dan pesan Postgres-nya tidak bisa
  // ditindaklanjuti admin. Diperiksa di sini supaya jawabannya menyebut apa
  // yang harus diubah lebih dulu.
  if (parsed.data.registration_enabled && !["public_form", "hybrid"].includes(event.participant_source)) {
    return apiError("VALIDATION_ERROR", 422, {
      message: 'Sumber peserta event ini bukan "Form registrasi publik" atau "Gabungan". Ubah dulu di konfigurasi event sebelum membuka pendaftaran.',
    });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("events")
    .update({
      registration_enabled: parsed.data.registration_enabled,
      // Auto-approve tanpa pendaftaran yang dibuka tidak punya arti, dan
      // menyimpannya sebagai true berarti event yang dibuka lagi berbulan
      // kemudian langsung menerbitkan QR tanpa ada yang memutuskan begitu.
      registration_auto_approve: parsed.data.registration_enabled && parsed.data.registration_auto_approve,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", event.id)
    .select("registration_enabled,registration_auto_approve")
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "registration_config_update",
    payload: { new: data },
  } as never);

  return Response.json(data);
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // `p_event_id` dikirim supaya RPC bisa MENOLAK id pendaftaran milik event
  // lain. Tanpa itu admin event A yang menempelkan id dari event B akan
  // membuat peserta di event yang salah, tanpa satu pun galat.
  const { data, error } = await getSupabaseServiceClient().rpc("review_event_registration" as never, {
    p_event_id: auth.scope.event.id,
    p_registration_id: parsed.data.id,
    p_actor: auth.user.id,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason ?? null,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  const hasil = data as { status: string; qr_code: string | null; participant_id: string | null };

  // Nama dan email diambil SESUDAH persetujuan, bukan dikirim dari layar.
  // Layar bisa saja menampilkan baris yang sudah basi; barisnya di database
  // adalah satu-satunya yang pasti sesuai dengan peserta yang barusan dibuat.
  let kirim: { state: string; error?: string } = { state: "not_configured" };
  if (hasil.status === "approved" && hasil.qr_code) {
    const { data: baris } = await getSupabaseServiceClient()
      .from("event_registrations")
      .select("name,email")
      .eq("id", parsed.data.id)
      .eq("event_id", auth.scope.event.id)
      .maybeSingle();
    const reg = baris as { name: string; email: string } | null;
    if (reg) {
      kirim = await sendRegistrationCode({
        eventId: auth.scope.event.id,
        registrationId: parsed.data.id,
        eventName: auth.scope.event.name,
        eventDate: auth.scope.event.event_date,
        timeZone: auth.scope.event.time_zone,
        to: reg.email,
        name: reg.name,
        qrCode: hasil.qr_code,
        actorId: auth.user.id,
      });
    }
  }

  // Status email menempel di jawaban, TIDAK mengubah status HTTP. Persetujuan
  // sudah tersimpan dan pesertanya sudah ada; membalas 5xx karena emailnya
  // gagal akan membuat admin menekan Setujui lagi dan menabrak
  // REGISTRATION_ALREADY_REVIEWED.
  return Response.json({ ...hasil, email: kirim });
}
