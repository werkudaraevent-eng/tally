import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { validateAnswers } from "@/lib/registration-fields";

/**
 * Pendaftaran peserta dari form publik. TANPA login — satu-satunya endpoint
 * tulis di aplikasi ini yang begitu.
 *
 * Karena itu setiap syaratnya diperiksa DUA KALI: di sini untuk pesan yang bisa
 * ditindaklanjuti, dan di dalam `submit_event_registration` untuk penegakan yang
 * sebenarnya. Bila keduanya berbeda pendapat, yang menang adalah database.
 */

const submitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // .email() ditambah pemeriksaan titik pada domain: Zod menerima "a@b", yang
  // lolos ke CHECK di database dan gagal di sana sebagai INTERNAL_ERROR.
  // Opsional DI SINI, wajib atau tidaknya ditentukan konfigurasi event di bawah.
  // Menuliskannya wajib di skema membuat event yang mematikan kolom ini menolak
  // setiap pengiriman, dan pesannya menyebut kolom yang tidak ada di layar.
  email: z.string().trim().toLowerCase().email().max(160).regex(/\.[^.@\s]+$/).optional().or(z.literal("")),
  phone: z.string().trim().min(6).max(30).regex(/^[0-9+()\-\s]+$/).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().nullable(),
  job_title: z.string().trim().max(160).optional().nullable(),
  // Field tambahan dari events.registration_form_config. Dibatasi 20 kunci agar
  // endpoint publik tidak bisa dipakai menitipkan jsonb berukuran bebas.
  extra: z.record(z.string().max(2000)).refine((value) => Object.keys(value).length <= 20).default({}),
});

/**
 * IP pendaftar. Di belakang proxy Vercel, `x-forwarded-for` berisi rantai dan
 * yang PALING KIRI adalah klien; mengambil elemen lain berarti seluruh
 * pendaftar tampak berasal dari satu alamat dan pembatasan di bawah tidak
 * pernah menggigit.
 */
function clientIp(request: Request): string | null {
  const chain = request.headers.get("x-forwarded-for");
  if (chain) return chain.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });
  if (!event.registration_enabled) return apiError("REGISTRATION_CLOSED", 422);

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // Jawaban field tambahan diperiksa terhadap konfigurasi event, bukan hanya
  // terhadap bentuk luarnya.
  //
  // Skema di atas hanya menahan "maksimal 20 kunci, masing-masing string
  // ≤2000 karakter". Tanpa pemeriksaan ini, endpoint publik menerima field wajib
  // yang dikosongkan, dropdown berisi nilai di luar daftarnya, dan kunci yang
  // tidak pernah didefinisikan admin — semuanya tersimpan permanen dan ikut
  // tersalin ke participants.extra saat disetujui.
  const config = (event.registration_form_config ?? {}) as RegistrationFormConfig;
  const fields = (config.fields ?? []) as RegistrationField[];

  // Bawaan WAJIB pada keduanya: konfigurasi lama tidak punya kunci ini, dan
  // menganggapnya opsional akan diam-diam melonggarkan setiap event yang sudah
  // berjalan.
  const requireEmail = config.require_email !== false;
  const requirePhone = config.require_phone !== false;
  if (requireEmail && !parsed.data.email) {
    return apiError("VALIDATION_ERROR", 422, { email: "Email wajib diisi." });
  }
  if (requirePhone && !parsed.data.phone) {
    return apiError("VALIDATION_ERROR", 422, { phone: "Nomor telepon wajib diisi." });
  }
  const { issues, clean } = validateAnswers(fields, parsed.data.extra);
  if (issues.length > 0) {
    return apiError("VALIDATION_ERROR", 422, Object.fromEntries(issues.map((issue) => [`extra.${issue.key}`, issue.message])));
  }

  const client = getSupabaseServiceClient();
  const ip = clientIp(request);

  // Indeks unik hanya menahan email yang SAMA. Satu skrip dengan alamat
  // berbeda-beda tetap bisa mengisi tabel sampai penuh, dan pada event
  // auto-approve setiap barisnya ikut membuat peserta yang muncul di undian.
  // Sepuluh per sepuluh menit longgar untuk satu keluarga yang mendaftar
  // bergantian dari satu ponsel, dan sempit untuk skrip.
  if (ip) {
    const sejak = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await client
      .from("event_registrations")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", event.id)
      .eq("submitted_ip", ip)
      .gte("created_at", sejak);
    if ((count ?? 0) >= 10) {
      return apiError("VALIDATION_ERROR", 429, {
        message: "Terlalu banyak pendaftaran dari perangkat ini. Tunggu 10 menit, lalu coba lagi.",
      });
    }
  }

  // Berkas: nilainya di `extra` adalah id baris registration_uploads, dan id itu
  // datang dari klien. Diperiksa TIGA hal sekaligus, karena masing-masing sendiri
  // tidak cukup:
  //
  //   * event-nya cocok — tanpa itu id milik event lain bisa ditempelkan ke sini;
  //   * belum diklaim pendaftaran lain — tanpa itu satu berkas bisa dipakai ulang
  //     oleh banyak pendaftaran;
  //   * kunci fieldnya cocok — tanpa itu berkas yang diunggah untuk "foto" bisa
  //     dilaporkan sebagai jawaban "KTP".
  const fileFields = fields.filter((field) => field.type === "file" && clean[field.key]);
  const uploadIds: string[] = [];
  if (fileFields.length > 0) {
    const { data: uploads } = await client
      .from("registration_uploads")
      .select("id,field_key")
      .eq("event_id", event.id)
      .is("registration_id", null)
      .in("id", fileFields.map((field) => clean[field.key]));
    // Cast eksplisit: tabel ini belum ada di tipe klien Supabase yang
    // dibangkitkan, jadi barisnya bertipe `never`. Pola yang sama dipakai
    // pemanggil RPC lain di berkas ini.
    const rows = (uploads ?? []) as unknown as Array<{ id: string; field_key: string }>;
    const byId = new Map(rows.map((row) => [row.id, row.field_key]));
    for (const field of fileFields) {
      if (byId.get(clean[field.key]) !== field.key) {
        return apiError("VALIDATION_ERROR", 422, {
          [`extra.${field.key}`]: `${field.label} gagal diunggah. Coba unggah ulang.`,
        });
      }
      uploadIds.push(clean[field.key]);
    }
  }

  const cleanExtra = clean;

  const { data, error } = await client.rpc("submit_event_registration" as never, {
    p_event_id: event.id,
    p_name: parsed.data.name,
    p_email: parsed.data.email || null,
    p_phone: parsed.data.phone || null,
    p_company: parsed.data.company ?? null,
    p_job_title: parsed.data.job_title ?? null,
    p_extra: cleanExtra,
    p_ip: ip,
    p_upload_ids: uploadIds,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  const hasil = data as { registration_id: string; status: string; qr_code: string | null };

  // Email hanya untuk jalur auto-approve: di event bermoderasi belum ada kode
  // yang bisa dikirim, dan email "pendaftaran diterima" tanpa kode hanya
  // membuat pendaftar mengira urusannya sudah selesai.
  //
  // Ditunggu (await), tidak dilepas sebagai janji menggantung. Di lingkungan
  // serverless, fungsi yang sudah membalas dapat dibekukan sebelum janji itu
  // selesai — emailnya hilang tanpa satu pun galat, dan `email_attempts` tidak
  // pernah naik sehingga tidak ada tanda bahwa ada yang tidak terkirim.
  // `parsed.data.email` bisa kosong sekarang. Tanpa syarat ini, pengiriman
  // dipanggil dengan alamat kosong dan gagal di penyedia email — tercatat
  // sebagai kegagalan yang harus dicoba ulang panitia, padahal memang tidak ada
  // tujuan yang bisa dikirimi.
  const kirim = hasil.status === "approved" && hasil.qr_code && parsed.data.email
    ? await sendRegistrationCode({
        eventId: event.id,
        registrationId: hasil.registration_id,
        eventName: event.name,
        eventDate: event.event_date,
        timeZone: event.time_zone,
        to: parsed.data.email as string,
        name: parsed.data.name,
        qrCode: hasil.qr_code,
      })
    : { state: "not_configured" as const };

  return Response.json({
    status: hasil.status,
    // qr_code hanya ada pada event auto-approve. Pendaftar di event bermoderasi
    // menerima null, dan halamannya harus mengatakan "menunggu persetujuan" —
    // bukan menampilkan kotak QR kosong.
    qr_code: hasil.qr_code,
    // Layar sukses memakai ini untuk memilih kalimatnya. Hanya `sent` yang boleh
    // menyebut email: menjanjikannya saat pengiriman gagal atau belum disetel
    // membuat pendaftar menutup halaman tanpa menyimpan kode, lalu menunggu
    // email yang tidak akan datang.
    email_sent: kirim.state === "sent",
    event: { name: event.name, slug: event.slug },
  });
}
