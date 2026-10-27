import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { type EventLandingConfig } from "@/lib/domain";
import { KONTAK_PANITIA_MAX } from "@/lib/kontak-panitia";
import { kontakBodySchema, type KontakPanitia } from "@/lib/landing-body-schema";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kontak panitia (Event settings > Kontak panitia).
 *
 * Disimpan di `landing_config.contact_*` (kontak utama) dan
 * `landing_config.contact_more` (kontak kedua dan ketiga), tempat yang sama dengan bagian
 * Kontak halaman acara sebelumnya, jadi isian lama terbawa tanpa migrasi.
 * PATCH hanya menulis kunci-kunci itu di atas salinan server yang terbaru;
 * editor Halaman acara tidak lagi menulisnya (lihat PATCH /api/admin/landing).
 *
 * Penjaga dua tab sama dengan Speakers: klien mengirim `base`, kontak seperti
 * yang terakhir ia baca. Bila yang tersimpan sudah berbeda, tidak ada yang
 * ditulis dan jawabannya 409 berisi kontak terbaru. Penulisan bersyarat
 * updated_at: simpanan lain di antara baca dan tulis tidak hilang.
 */

type Baris = { landing_config: EventLandingConfig | null; updated_at: string };

const KUNCI = ["contact_name", "contact_email", "contact_phone"] as const;

type Tambahan = NonNullable<KontakPanitia["contact_more"]>;

/** Kontak kedua dan ketiga yang terisi, dirapikan. Baris kosong dibuang. */
function rapikanTambahan(daftar: EventLandingConfig["contact_more"]): Tambahan {
  return (daftar ?? [])
    .map((item) => ({ name: item?.name?.trim() ?? "", email: item?.email?.trim() ?? "", phone: item?.phone?.trim() ?? "" }))
    .filter((item) => item.name || item.email || item.phone)
    .slice(0, KONTAK_PANITIA_MAX - 1);
}

function kontakDari(landing: EventLandingConfig): Required<KontakPanitia> {
  return {
    contact_name: landing.contact_name?.trim() ?? "",
    contact_email: landing.contact_email?.trim() ?? "",
    contact_phone: landing.contact_phone?.trim() ?? "",
    contact_more: rapikanTambahan(landing.contact_more),
  };
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  return Response.json(kontakDari((auth.scope.event.landing_config ?? {}) as EventLandingConfig));
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = kontakBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const baru = parsed.data.contact;

  const client = getSupabaseServiceClient();
  let lama: KontakPanitia | null = null;
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
    lama = kontakDari(landing);
    const terbaca = lama;
    const tambahanBeda = parsed.data.base.contact_more !== undefined && JSON.stringify(rapikanTambahan(parsed.data.base.contact_more)) !== JSON.stringify(terbaca.contact_more);
    if (tambahanBeda || KUNCI.some((kunci) => (parsed.data.base[kunci] ?? "").trim() !== terbaca[kunci])) {
      return apiError("CONTACT_CHANGED", 409, lama);
    }
    // Kosong disimpan sebagai tidak ada, seperti editor halaman acara dulu.
    // Tanpa `contact_more` (tab lama): kontak tambahan yang tersimpan tetap.
    const tambahan = baru.contact_more === undefined ? (terbaca.contact_more ?? []) : rapikanTambahan(baru.contact_more);
    const isi = {
      ...Object.fromEntries(KUNCI.map((kunci) => [kunci, baru[kunci] || undefined])),
      contact_more: tambahan.length > 0 ? tambahan.map((item) => Object.fromEntries(Object.entries(item).filter(([, nilai]) => nilai))) : undefined,
    };
    const hasil = await client
      .from("events")
      .update({ landing_config: { ...landing, ...isi }, updated_at: new Date().toISOString() } as never)
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
    action: "contact_update",
    payload: { old: lama, new: baru },
  } as never);

  return Response.json(kontakDari(((data as Baris | null)?.landing_config ?? {}) as EventLandingConfig));
}
