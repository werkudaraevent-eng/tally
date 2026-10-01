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
      end_time: "Jam selesai harus setelah jam mulai. Untuk acara yang melewati tengah malam, isi tanggal selesai.",
    });
  }

  // Konfigurasi formulir dibaca dari event yang SUDAH dimuat oleh
  // requireRequestEvent, bukan dari permintaan. Klien layar ini tidak mengirim
  // susunan field, dan menulis ulang seluruh kolomnya dari permintaan akan
  // menghapus setiap field tambahan yang dibuat di CMS Registrasi.
  const formConfig = (auth.scope.event.registration_form_config ?? {}) as RegistrationFormConfig;
  const formThemeBaru: RegistrationFormConfig | null = formTheme
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
  const { data, error } = await client
    .from("events")
    .update({
      ...facts,
      ...(formThemeBaru ? { registration_form_config: formThemeBaru } : {}),
      landing_config: {
        ...landing,
        // Peran warna diturunkan di server, sama seperti tema form pendaftaran.
        // Halaman publiknya menerima hex jadi dan tidak memuat pustaka warna.
        theme: landing.theme ? withDerivedRoles(landing.theme) : undefined,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", auth.scope.event.id)
    .select("description,tagline,start_time,end_time,end_date,venue_name,venue_address,venue_map_url,landing_config,registration_form_config")
    .single();

  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "landing_page_update",
    payload: { new: data },
  } as never);

  return Response.json(data);
}
