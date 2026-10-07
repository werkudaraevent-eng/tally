import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { landingBodySchema as bodySchema } from "@/lib/landing-body-schema";
import { type RegistrationFormConfig } from "@/lib/domain";
import { DEFAULT_REGISTRATION_SEED, withDerivedRoles } from "@/lib/registration-theme";

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { landing, form_theme: formTheme, ...facts } = parsed.data;

  // Jam selesai sebelum jam mulai pada acara SEHARI. Untuk acara lebih dari
  // satu hari perbandingan ini tidak berlaku — acara yang mulai 20.00 dan
  // selesai 02.00 keesokan harinya sah, dan `end_date` yang menyatakannya.
  if (!facts.end_date && facts.start_time && facts.end_time && facts.end_time <= facts.start_time) {
    return apiError("VALIDATION_ERROR", 422, {
      end_time: "End time must be after the start time. For an event that runs past midnight, fill in the end date.",
    });
  }

  // Konfigurasi formulir dibaca dari event yang SUDAH dimuat oleh
  // requireRequestEvent, bukan dari permintaan. Klien layar ini tidak mengirim
  // susunan field, dan menulis ulang seluruh kolomnya dari permintaan akan
  // menghapus setiap field tambahan yang dibuat di CMS Registrasi.
  const susunTema = (formConfig: RegistrationFormConfig): RegistrationFormConfig | null => formTheme
    ? {
        ...formConfig,
        theme: formTheme.inherit
          // Warna sendiri TIDAK dihapus saat saklarnya dimatikan. Admin yang
          // menyalakannya lagi mendapatkan warnanya kembali, bukan warna bawaan
          // yang harus dipilih ulang dari ingatan.
          ? { ...(formConfig.theme ?? { seed: DEFAULT_REGISTRATION_SEED }), inherit: true }
          : withDerivedRoles({
              ...(formConfig.theme ?? {}),
              seed: formTheme.seed ?? formConfig.theme?.seed ?? DEFAULT_REGISTRATION_SEED,
              inherit: false,
            }),
      }
    : null;

  const client = getSupabaseServiceClient();
  // Tema formulir ditulis hanya kalau updated_at masih sama dengan saat dibaca:
  // penyunting form dan layar Client view juga menulis seluruh JSON
  // registration_form_config (QA #102, H2). Berubah -> baca ulang, coba sekali lagi.
  let tersimpan = (auth.scope.event.registration_form_config ?? {}) as RegistrationFormConfig;
  let versi = auth.scope.event.updated_at;
  let data: unknown = null;
  for (let percobaan = 0; ; percobaan++) {
    const formThemeBaru = susunTema(tersimpan);
    let query = client
      .from("events")
      .update({
        ...facts,
        ...(formThemeBaru ? { registration_form_config: formThemeBaru } : {}),
        landing_config: {
          ...landing,
          // Area peserta punya layar dan endpoint sendiri (/api/admin/area-peserta).
          // Salinan `member` dari editor ini bisa basi, jadi yang tersimpan dipakai.
          member: (auth.scope.event.landing_config as { member?: unknown } | null)?.member,
          // Peran warna diturunkan di server, sama seperti tema form pendaftaran.
          // Halaman publiknya menerima hex jadi dan tidak memuat pustaka warna.
          theme: landing.theme ? withDerivedRoles(landing.theme) : undefined,
        },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", auth.scope.event.id);
    if (formThemeBaru) query = query.eq("updated_at", versi);
    const hasil = await query
      .select("description,tagline,start_time,end_time,end_date,venue_name,venue_address,venue_map_url,landing_config,registration_form_config")
      .maybeSingle();

    if (hasil.error) return apiError("INTERNAL_ERROR", 500);
    if (hasil.data) { data = hasil.data; break; }
    if (!formThemeBaru || percobaan >= 1) return apiError("CONFLICT", 409);
    const { data: segar, error: galatBaca } = await client.from("events").select("registration_form_config,updated_at").eq("id", auth.scope.event.id).single();
    if (galatBaca || !segar) return apiError("INTERNAL_ERROR", 500);
    tersimpan = ((segar as { registration_form_config: RegistrationFormConfig | null }).registration_form_config ?? {}) as RegistrationFormConfig;
    versi = (segar as { updated_at: string }).updated_at;
  }

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "landing_page_update",
    payload: { new: data },
  } as never);

  return Response.json(data);
}
