import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { sendRegistrationCode, sendRegistrationRejected } from "@/lib/email/registration-code";
import { PRESET_LABELS, templatSchema } from "@/lib/email/konfirmasi/templat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { landingFormOnly } from "@/lib/landing-i18n";
import { LANDING_HEADING_FONTS, type EventLandingConfig, type RegistrationField, type RegistrationFormConfig } from "@/lib/domain";
import { FIELD_KEY_PATTERN, MAX_CUSTOM_FIELDS, validateFieldDefinitions } from "@/lib/registration-fields";
import { DEFAULT_REGISTRATION_SEED } from "@/lib/registration-theme";
import { registrationCodeUrl } from "@/lib/registration-code-url";
import { resolveFormTheme } from "@/lib/registration-theme-css";
import { landingTokens } from "@/lib/landing-tokens";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { invitationSettings, undanganBelumAda } from "@/lib/undangan/data";

/** Yang dipakai formulir dari Tema halaman acara, plus status area peserta. */
function tampilanFormulir(landing: EventLandingConfig | null) {
  // Sama dengan bingkaiFormulir (src/app/daftar/isi-daftar.tsx): logo, gambar
  // utama, dan huruf judul hanya dipakai formulir berkerangka v2.
  const v2 = landing?.layout === "modern" || landing?.layout === "forum" || landingFormOnly(landing);
  return {
    v2,
    logo: v2 && Boolean(landing?.nav?.logo_url),
    kv: v2 ? landing?.banner_url ?? null : null,
    huruf: v2 ? LANDING_HEADING_FONTS[landingTokens(landing, landing?.layout === "forum" ? "forum" : "modern").headingFont].label : null,
    area_peserta: Boolean(landing?.member?.enabled),
  };
}

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

const fieldSchema = z.object({
  key: z.string().trim().regex(FIELD_KEY_PATTERN),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "email", "tel", "textarea", "select", "radio", "checkbox", "date", "number", "file"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  option_descriptions: z.array(z.string().trim().max(300)).max(50).optional(),
  placeholder: z.string().trim().max(120).optional(),
  help_text: z.string().trim().max(300).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

/**
 * Kedua sakelar OPSIONAL. Yang tidak dikirim tidak diubah.
 *
 * Dulu keduanya wajib, dan itu memaksa setiap pemanggil mengirim ulang nilai
 * yang sedang ada di layarnya. Layar penyunting formulir memuat nilainya sekali
 * saat halaman dibuka lalu tidak pernah menyegarkannya; menekan "Simpan form"
 * satu jam kemudian akan mengirim ulang sakelar sebagaimana keadaannya SATU JAM
 * LALU. Kalau di antaranya ada panitia lain yang membuka pendaftaran, simpan
 * form itu menutupnya kembali -- tanpa menyentuh sakelarnya, tanpa pesan apa
 * pun, dan tanpa jejak selain satu baris audit yang terbaca seolah sengaja.
 */
const configSchema = z.object({
  registration_enabled: z.boolean().optional(),
  registration_auto_approve: z.boolean().optional(),
  // Tamu undangan (migrasi 202610040007). Hanya ditulis bila dikirim, jadi
  // pemanggil lama tetap jalan sebelum migrasinya ada.
  registration_access: z.enum(["terbuka", "undangan"]).optional(),
  invitation_auto_approve: z.boolean().optional(),
  // Opsional supaya pemanggil lama yang hanya menyalakan/mematikan pendaftaran
  // tidak ikut mengosongkan seluruh susunan form.
  form: z
    .object({
      fields: z.array(fieldSchema).max(MAX_CUSTOM_FIELDS),
      welcome_text: z.string().trim().max(1000).optional(),
      success_text: z.string().trim().max(1000).optional(),
      require_email: z.boolean().optional(),
      require_phone: z.boolean().optional(),
      require_company: z.boolean().optional(),
      require_job_title: z.boolean().optional(),
      // `theme` sengaja TIDAK diterima di sini. Warna acara diatur di CMS
      // halaman acara — satu tempat untuk halaman acara dan formulirnya — dan
      // endpoint ini mempertahankan tema yang sudah tersimpan apa adanya.
    })
    .optional(),
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

  const [result, menunggu, konfigurasi, setelanEmail] = await Promise.all([
    query,
    client.from("event_registrations").select("id", { head: true, count: "exact" })
      .eq("event_id", eventId).eq("status", "pending"),
    // `registration_auto_approve` sengaja TIDAK ditambahkan ke EVENT_COLUMNS:
    // kolom itu hanya dipakai halaman ini, sedangkan EVENT_COLUMNS ikut di
    // setiap resolusi event di seluruh aplikasi.
    client.from("events").select("registration_auto_approve").eq("id", eventId).single(),
    // Ringkasan email konfirmasi untuk baris "Email konfirmasi · Atur email".
    // Galat (migrasi 0006 belum dijalankan) = templat bawaan.
    client.from("event_settings").select("registration_email").eq("event_id", eventId).maybeSingle(),
  ]);
  if (result.error) return apiError("INTERNAL_ERROR", 500);
  const undangan = await invitationSettings(eventId);
  const { count: jumlahTamu } = undangan.ready
    ? await client.from("event_invitations").select("id", { head: true, count: "exact" }).eq("event_id", eventId).is("deleted_at", null)
    : { count: 0 };

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
      name: auth.scope.event.name,
      // Susunan form dikirim apa adanya supaya penyunting memuat keadaan yang
      // sama persis dengan yang dipakai halaman publik — bukan hasil rekaan
      // ulang dari beberapa medan terpisah.
      registration_form_config: auth.scope.event.registration_form_config ?? {},
      // Warna yang BENAR-BENAR dipakai halaman pendaftaran, sudah memperhitungkan
      // saklar "ikut warna halaman acara". Dihitung di sini supaya pratinjau di
      // CMS tidak menebaknya sendiri — pratinjau yang menebak berhenti menjadi
      // pratinjau begitu tebakannya meleset.
      form_theme_seed:
        resolveFormTheme(
          (auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.theme,
          (auth.scope.event.landing_config as EventLandingConfig | null)?.theme,
        )?.seed ?? DEFAULT_REGISTRATION_SEED,
      // Ringkasan Tema halaman acara untuk kartu "Tampilan mengikuti Tema" di
      // Atur formulir. Hanya yang dipakai formulir; mengubahnya tetap di Tema.
      tampilan: tampilanFormulir(auth.scope.event.landing_config as EventLandingConfig | null),
      // Tamu undangan: mode pendaftaran, sakelar tamu langsung disetujui, dan
      // jumlah tamu untuk tab dan konfirmasi ganti mode. Null = migrasi belum ada.
      undangan: undangan.ready ? { access: undangan.access, auto_approve: undangan.autoApprove, count: jumlahTamu } : null,
      email_konfirmasi: ringkasanEmail(setelanEmail.error ? null : (setelanEmail.data as { registration_email: unknown } | null)?.registration_email ?? null),
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

  /**
   * Sumber peserta dinaikkan sendiri saat pendaftaran dibuka, bukan ditolak.
   *
   * CHECK `events_registration_source` menuntut sumbernya public_form atau
   * hybrid sebelum `registration_enabled` boleh true. Versi sebelumnya menolak
   * permintaannya dan menyuruh admin "ubah dulu di konfigurasi event" -- sebuah
   * layar yang TIDAK ADA. `participant_source` hanya bisa diisi saat event
   * dibuat; PATCH event hanya melayani perpindahan status. Jadi pesan itu
   * mengirim admin ke jalan buntu, dan satu-satunya jalan keluarnya adalah
   * membuat ulang seluruh acara.
   *
   * Menaikkannya di sini bukan menebak maksud admin: menyalakan pendaftaran
   * publik TIDAK punya arti lain selain "acara ini menerima peserta dari
   * formulir". Scanner API yang sudah menyala dipertahankan, karena mematikannya
   * akan menghentikan sinkronisasi yang tidak diminta siapa pun.
   */
  const sumberBaru =
    parsed.data.registration_enabled === true && !["public_form", "hybrid"].includes(event.participant_source)
      ? event.participant_source === "scanner_api"
        ? "hybrid"
        : "public_form"
      : null;

  // Susunan form diperiksa DI SINI, bukan hanya di penyunting.
  //
  // Skema Zod di atas hanya menahan bentuknya. Aturan yang membuat sebuah field
  // dapat dipakai — kunci unik, dropdown punya minimal dua pilihan, batas angka
  // masuk akal — hidup di satu berkas bersama validasi jawaban, supaya definisi
  // dan pemeriksaannya tidak bisa berbeda pendapat.
  let formConfig: RegistrationFormConfig | undefined;
  if (parsed.data.form) {
    const issues = validateFieldDefinitions(parsed.data.form.fields as RegistrationField[]);
    if (issues.length > 0) {
      return apiError("VALIDATION_ERROR", 422, Object.fromEntries(issues.map((issue) => [issue.key || "fields", issue.message])));
    }
    formConfig = {
      ...parsed.data.form,
      fields: parsed.data.form.fields as RegistrationField[],
      // Tema DIPERTAHANKAN dari yang sudah tersimpan, bukan dikirim ulang dari
      // layar ini. Tanpa baris ini, menyimpan susunan field akan menghapus warna
      // formulir yang dipilih di CMS halaman acara — dan tidak ada apa pun di
      // layar ini yang memberi tahu bahwa itu terjadi.
      theme: (event.registration_form_config as RegistrationFormConfig | null)?.theme,
      // Sama seperti tema: pilihan jawaban untuk klien diatur di layar Client
      // view, dan menyimpan susunan form tidak boleh diam-diam menghapusnya.
      client_fields: (event.registration_form_config as RegistrationFormConfig | null)?.client_fields,
    };
  }

  /**
   * Nilai efektif sakelar pendaftaran: yang dikirim kalau ada, kalau tidak yang
   * sedang tersimpan. `event` berasal dari requireRequestEvent, jadi ia dibaca
   * pada permintaan ini juga -- bukan salinan yang dibawa peramban.
   */
  const pendaftaranAktif = parsed.data.registration_enabled ?? event.registration_enabled;

  /**
   * Auto-approve hanya ditulis ketika ada yang perlu ditulis.
   *
   *   * Dikirim  -> pakai nilainya, tetap tunduk pada invarian "tidak boleh
   *                true selama pendaftaran tertutup".
   *   * Tidak dikirim tetapi pendaftaran sedang DITUTUP -> dipaksa false, karena
   *                invarian itu harus tetap berlaku sesudah perubahan ini.
   *   * Tidak dikirim dan pendaftaran tidak ditutup -> tidak disentuh sama
   *                sekali. Nilainya tidak ada di EVENT_COLUMNS, jadi menebaknya
   *                di sini berarti menebak.
   *
   * Auto-approve tanpa pendaftaran yang dibuka tidak punya arti, dan
   * menyimpannya sebagai true berarti event yang dibuka lagi berbulan kemudian
   * langsung menerbitkan QR tanpa ada yang memutuskan begitu.
   */
  const autoApprove =
    parsed.data.registration_auto_approve !== undefined
      ? { registration_auto_approve: pendaftaranAktif && parsed.data.registration_auto_approve }
      : pendaftaranAktif === false
        ? { registration_auto_approve: false }
        : {};

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("events")
    .update({
      ...(parsed.data.registration_enabled !== undefined ? { registration_enabled: parsed.data.registration_enabled } : {}),
      ...(sumberBaru ? { participant_source: sumberBaru } : {}),
      ...(formConfig ? { registration_form_config: formConfig } : {}),
      ...autoApprove,
      ...(parsed.data.registration_access !== undefined ? { registration_access: parsed.data.registration_access } : {}),
      ...(parsed.data.invitation_auto_approve !== undefined ? { invitation_auto_approve: parsed.data.invitation_auto_approve } : {}),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", event.id)
    .select("registration_enabled,registration_auto_approve,registration_form_config,participant_source")
    .single();
  if (error && (parsed.data.registration_access !== undefined || parsed.data.invitation_auto_approve !== undefined) && undanganBelumAda(error)) {
    return apiError("INVITATIONS_NOT_READY", 409);
  }
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "registration_config_update",
    // Kenaikan sumber peserta dicatat terpisah, bukan tenggelam di dalam `new`.
    // Ia satu-satunya kolom di sini yang diubah aplikasi atas inisiatifnya
    // sendiri, dan yang diubah tanpa diminta harus bisa ditelusuri.
    payload: { new: data, ...(sumberBaru ? { participant_source_promoted_to: sumberBaru } : {}) },
  } as never);

  return Response.json(data);
}

/** Preset dan sakelar Tidak disetujui dari templat tersimpan; null = templat bawaan. */
function ringkasanEmail(raw: unknown): { preset: string | null; kirim_ditolak: boolean } {
  const hasil = templatSchema.safeParse(raw);
  return hasil.success ? { preset: PRESET_LABELS[hasil.data.preset].label, kirim_ditolak: hasil.data.kirim_ditolak } : { preset: null, kirim_ditolak: false };
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
      .select("name,email,company,access_token")
      .eq("id", parsed.data.id)
      .eq("event_id", auth.scope.event.id)
      .maybeSingle();
    const reg = baris as { name: string; email: string; company: string | null; access_token: string | null } | null;
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
        codeUrl: registrationCodeUrl(await linkOrigin(request, auth.scope.event.id), auth.scope.event.slug, reg.access_token),
        origin: await linkOrigin(request, auth.scope.event.id),
        company: reg.company,
        actorId: auth.user.id,
      });
    }
  }

  // Email "Tidak disetujui": hanya bila panitia menyalakannya di Email
  // otomatis (bawaan mati); sendRegistrationRejected memeriksa sakelarnya.
  if (hasil.status === "rejected") {
    const { data: baris } = await getSupabaseServiceClient()
      .from("event_registrations")
      .select("name,email,company")
      .eq("id", parsed.data.id)
      .eq("event_id", auth.scope.event.id)
      .maybeSingle();
    const reg = baris as { name: string; email: string | null; company: string | null } | null;
    if (reg?.email) {
      kirim = await sendRegistrationRejected({
        eventId: auth.scope.event.id,
        registrationId: parsed.data.id,
        to: reg.email,
        name: reg.name,
        company: reg.company,
        requestUrl: await linkOrigin(request, auth.scope.event.id),
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
