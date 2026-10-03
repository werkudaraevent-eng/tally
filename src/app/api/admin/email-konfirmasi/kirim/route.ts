import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { daftarBelumTerima } from "@/lib/email/konfirmasi/tertunda";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { registrationCodeUrl } from "@/lib/registration-code-url";

/**
 * "Kirim ke mereka…": email ber-QR untuk pendaftar disetujui yang belum pernah
 * menerimanya (mis. mendaftar saat email belum aktif).
 *
 * Tidak lewat mesin batch Pesan peserta: /emails/batch Resend tidak menerima
 * lampiran, jadi QR inline (cid) tidak bisa ikut. Di sini satu per satu, jeda
 * di antaranya supaya tetap di bawah batas laju Resend, masing-masing dicatat
 * lewat record_registration_email seperti tombol Kirim kode di Pendaftaran.
 *
 * Paling banyak PER_PANGGILAN orang per permintaan (batas waktu fungsi
 * serverless); layar memanggil lagi selama `sisa` > 0. `expected` di panggilan
 * pertama harus sama dengan angka di dialog, seperti Kiriman.
 */

const PER_PANGGILAN = 25;
const JEDA_MS = 600;

const schema = z.object({ expected: z.number().int().min(0).optional() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!isEmailConfigured()) return apiError("EMAIL_NOT_CONFIGURED", 503);

  const event = auth.scope.event;
  const semua = await daftarBelumTerima(event.id);
  if (parsed.data.expected !== undefined && parsed.data.expected !== semua.length) {
    return apiError("MESSAGE_COUNT_CHANGED", 409, { count: semua.length });
  }

  const origin = new URL(request.url).origin;
  let terkirim = 0;
  const gagal: { name: string; error: string }[] = [];
  for (const [index, reg] of semua.slice(0, PER_PANGGILAN).entries()) {
    if (index > 0) await new Promise((selesai) => setTimeout(selesai, JEDA_MS));
    const hasil = await sendRegistrationCode({
      eventId: event.id,
      registrationId: reg.id,
      eventName: event.name,
      eventDate: event.event_date,
      timeZone: event.time_zone,
      to: reg.email,
      name: reg.name,
      company: reg.company,
      qrCode: reg.qr_code,
      codeUrl: registrationCodeUrl(request.url, event.slug, reg.access_token),
      origin,
      actorId: auth.user.id,
    });
    if (hasil.state === "sent") terkirim += 1;
    else gagal.push({ name: reg.name, error: hasil.state === "failed" ? hasil.error : hasil.state });
  }
  // Yang gagal tetap tercatat email_error di Pendaftaran dan tidak dihitung
  // lagi di sisa (supaya layar tidak mengulang alamat yang sama tanpa henti).
  const sisa = Math.max(0, semua.length - PER_PANGGILAN);
  return Response.json({ terkirim, gagal, sisa });
}
