import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

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
  email: z.string().trim().toLowerCase().email().max(160).regex(/\.[^.@\s]+$/),
  phone: z.string().trim().min(6).max(30).regex(/^[0-9+()\-\s]+$/),
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

  const { data, error } = await client.rpc("submit_event_registration" as never, {
    p_event_id: event.id,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_company: parsed.data.company ?? null,
    p_job_title: parsed.data.job_title ?? null,
    p_extra: parsed.data.extra,
    p_ip: ip,
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
  const kirim = hasil.status === "approved" && hasil.qr_code
    ? await sendRegistrationCode({
        eventId: event.id,
        registrationId: hasil.registration_id,
        eventName: event.name,
        eventDate: event.event_date,
        timeZone: event.time_zone,
        to: parsed.data.email,
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
