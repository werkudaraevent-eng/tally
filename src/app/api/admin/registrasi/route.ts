import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
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
    .select("id,name,email,phone,company,job_title,extra,status,reject_reason,created_at,reviewed_at,participant_id", { count: "exact" })
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

  return Response.json({
    registrations: result.data ?? [],
    total: result.count ?? 0,
    pending: menunggu.count ?? 0,
    event: {
      registration_enabled: auth.scope.event.registration_enabled,
      registration_auto_approve: (konfigurasi.data as { registration_auto_approve: boolean } | null)?.registration_auto_approve ?? false,
      participant_source: auth.scope.event.participant_source,
      slug: auth.scope.event.slug,
    },
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

  return Response.json(data);
}
