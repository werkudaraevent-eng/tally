import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { type EventLandingConfig } from "@/lib/domain";
import { SPEAKERS_BODY_MAX, speakersBodySchema } from "@/lib/landing-body-schema";
import { samaJson } from "@/lib/landing-speakers-sama";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Daftar pembicara (menu admin "Speakers").
 *
 * Disimpan di `landing_config.speakers`, kolom yang sama dengan halaman acara,
 * tetapi PATCH di sini hanya menulis kunci `speakers` di atas salinan server
 * yang terbaru. Editor Halaman acara tidak lagi menulis `speakers` (lihat
 * PATCH /api/admin/landing), jadi dua layar ini tidak saling menimpa.
 *
 * Penjaga dua tab: klien mengirim `base`, daftar seperti yang terakhir ia baca.
 * Bila daftar tersimpan sudah berbeda, tidak ada yang ditulis dan jawabannya
 * 409 berisi daftar terbaru. Penulisan sendiri bersyarat updated_at, jadi
 * simpanan halaman acara atau area peserta di antara baca dan tulis tidak
 * hilang: baca ulang, periksa lagi, coba sekali lagi.
 */

type Baris = { landing_config: EventLandingConfig | null; updated_at: string };

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const landing = (auth.scope.event.landing_config ?? {}) as EventLandingConfig;
  return Response.json({
    speakers: landing.speakers ?? [],
    speaker_frame: landing.speaker_frame ?? "portrait",
    layout: landing.layout ?? "modern",
    en_enabled: Boolean(landing.en_enabled),
  });
}

/**
 * Badan permintaan sebagai teks, dibaca sepotong-sepotong dan dihentikan begitu
 * melewati `maks` byte, juga tanpa Content-Length (chunked). null bila terlalu besar.
 */
async function bacaTerbatas(request: Request, maks: number): Promise<string | null> {
  if (!request.body) return "";
  const pembaca = request.body.getReader();
  const potongan: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await pembaca.read().catch(() => ({ done: true, value: undefined }));
    if (done || !value) break;
    total += value.byteLength;
    if (total > maks) {
      await pembaca.cancel().catch(() => undefined);
      return null;
    }
    potongan.push(value);
  }
  const gabung = new Uint8Array(total);
  let posisi = 0;
  for (const bagian of potongan) { gabung.set(bagian, posisi); posisi += bagian.byteLength; }
  return new TextDecoder().decode(gabung);
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const panjang = Number(request.headers.get("content-length") ?? 0);
  if (panjang > SPEAKERS_BODY_MAX) return apiError("PAYLOAD_TOO_LARGE", 413);
  const teks = await bacaTerbatas(request, SPEAKERS_BODY_MAX);
  if (teks === null) return apiError("PAYLOAD_TOO_LARGE", 413);
  let badan: unknown = null;
  try { badan = JSON.parse(teks); } catch { badan = null; }
  const parsed = speakersBodySchema.safeParse(badan);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  let lama: unknown = null;
  let data: unknown = null;
  for (let percobaan = 0; ; percobaan++) {
    const { data: terkini, error: galatBaca } = await client
      .from("events")
      .select("landing_config,updated_at")
      .eq("id", auth.scope.event.id)
      .single();
    if (galatBaca || !terkini) return apiError("INTERNAL_ERROR", 500);
    const baris = terkini as Baris;
    const landing = (baris.landing_config ?? {}) as EventLandingConfig;
    lama = landing.speakers ?? [];
    if (!samaJson(lama, parsed.data.base)) {
      return apiError("SPEAKERS_CHANGED", 409, { speakers: lama });
    }
    const hasil = await client
      .from("events")
      .update({ landing_config: { ...landing, speakers: parsed.data.speakers }, updated_at: new Date().toISOString() } as never)
      .eq("id", auth.scope.event.id)
      .eq("updated_at", baris.updated_at)
      .select("landing_config")
      .maybeSingle();
    if (hasil.error) return apiError("INTERNAL_ERROR", 500);
    if (hasil.data) { data = hasil.data; break; }
    if (percobaan >= 1) return apiError("CONFLICT", 409);
  }

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "speakers_update",
    payload: { old: lama, new: parsed.data.speakers },
  } as never);

  return Response.json({ speakers: (data as { landing_config?: EventLandingConfig } | null)?.landing_config?.speakers ?? parsed.data.speakers });
}
