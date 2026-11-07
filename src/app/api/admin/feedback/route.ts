import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { landingDefaultLang, landingEnAvailable } from "@/lib/landing-i18n";
import type { EventLandingConfig } from "@/lib/domain";
import { memberConfig } from "@/lib/member/account";
import { normalizeTimeZone, timeZoneAbbr, timeZoneOffset } from "@/lib/timezone";
import { alamatKilasBalik } from "@/lib/kilas-balik/alamat";
import { labelKolom, muatHasil, muatSetelan, pesertaContoh, semuaJudulAgenda, sesiCheckin } from "@/lib/kilas-balik/server";
import { kolomSasaran } from "@/lib/sasaran-bagian";
import { GATHERING_ACCENT_DEFAULT, landingTokens } from "@/lib/landing-tokens";
import { KARTU_AWAL, masalahLogika, pertanyaanAwal, ringkasHasil, setelanSchema } from "@/lib/kilas-balik/setelan";

/**
 * Admin > Feedback (migrasi 202611070010).
 *
 * GET  setelan (atau pertanyaan awal bila belum pernah disimpan), judul Agenda
 *      untuk "Fill from Agenda", ringkasan hasil, dan baris jawaban beserta
 *      kolom pesertanya.
 * PUT  simpan setelan. Upsert satu baris per acara.
 *
 * Sebelum migrasi: `{ siap: false }`, layar admin menampilkan "belum siap".
 */

const belumSiap = () => Response.json({ siap: false });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat) return apiError("INTERNAL_ERROR", 500);
  if (!muat.siap) return belumSiap();
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const lang = landingDefaultLang(landing);
  const [agenda, hasil, contoh, sesi] = await Promise.all([semuaJudulAgenda(event.id), muatHasil(event.id), pesertaContoh(event.id), sesiCheckin(event.id)]);
  const tokens = landingTokens(landing);
  const setelan = muat.ada ? muat.setelan : { ...muat.setelan, questions: pertanyaanAwal(lang, agenda), cards: KARTU_AWAL };
  return Response.json({
    siap: true,
    tersimpan: muat.ada,
    setelan,
    agenda,
    lang,
    area_peserta: memberConfig(event) !== null,
    tautan: alamatKilasBalik(event.slug),
    slug: event.slug,
    bahasa_lain: landingEnAvailable(landing),
    // Untuk Show if: sesi check-in dan kolom pilihan pendaftaran (sama dengan Agenda > Who sees it).
    logika: {
      sesi,
      kolom: kolomSasaran(event.registration_form_config).map((k) => ({ key: k.key, label: k.label, options: k.options })),
      hadiah: memberConfig(event)?.prize?.enabled === true,
    },
    tema_acara: { brand: tokens.brand, accent: tokens.accent ?? GATHERING_ACCENT_DEFAULT },
    contoh,
    zona: { offset: timeZoneOffset(normalizeTimeZone(event.time_zone)), singkat: timeZoneAbbr(normalizeTimeZone(event.time_zone)) },
    hasil: hasil
      ? {
          total_peserta: hasil.totalPeserta,
          jumlah: hasil.baris.length,
          ringkas: ringkasHasil(setelan.questions, hasil.baris),
          baris: hasil.baris.slice(0, 1000),
          label: labelKolom(event),
        }
      : null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const parsed = setelanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const s = parsed.data;
  // Syarat pada data acara: sesi atau kolom pendaftaran yang sudah dihapus membuat pertanyaan diam-diam tidak pernah tampil.
  if (s.questions.some((q) => q.show_if?.some((x) => x.source === "checkin" || x.source === "field"))) {
    const sesi = await sesiCheckin(event.id);
    const kolom = kolomSasaran(event.registration_form_config).map((k) => ({ key: k.key, options: k.options }));
    const masalah = masalahLogika(s.questions, { sesi: sesi.map((x) => x.id), kolom });
    if (masalah.length) return apiError("VALIDATION_ERROR", 422, { formErrors: [masalah[0].pesan], fieldErrors: {} });
  }
  const baris = {
    event_id: event.id,
    enabled: s.enabled,
    title: s.title || null,
    intro: s.intro || null,
    closing: s.closing || null,
    signed_by: s.signed_by || null,
    display: s.display,
    theme: s.theme,
    questions: s.questions,
    cards: s.cards,
    opens_at: s.opens_at,
    closes_at: s.closes_at,
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  };
  const client = getSupabaseServiceClient();
  const { error } = await client.from("feedback_settings" as never).upsert(baris as never, { onConflict: "event_id" });
  if (error) {
    const kode = (error as { code?: string }).code;
    if (kode === "42P01" || kode === "PGRST205") return belumSiap();
    return apiError("INTERNAL_ERROR", 500);
  }
  await client.from("audit_logs").insert({ event_id: event.id, user_id: auth.user.id, action: "feedback_settings_save", payload: { new: baris } } as never);
  return Response.json({ ok: true, updated_at: baris.updated_at });
}
