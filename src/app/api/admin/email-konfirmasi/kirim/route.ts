import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { bolehDikirim, daftarBelumTerima } from "@/lib/email/konfirmasi/tertunda";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { messagingAllowlist } from "@/lib/pesan/alamat";
import { registrationCodeUrl } from "@/lib/registration-code-url";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * "Kirim ke mereka…": email ber-QR untuk pendaftar disetujui yang belum pernah
 * menerimanya (mis. mendaftar saat email belum aktif).
 *
 * Tidak lewat mesin batch Pesan peserta: /emails/batch Resend tidak menerima
 * lampiran, jadi QR inline (cid) tidak bisa ikut. Di sini satu per satu, jeda
 * di antaranya supaya tetap di bawah batas laju Resend, masing-masing dicatat
 * lewat record_registration_email seperti tombol Kirim kode di Pendaftaran.
 *
 * Dua putaran bersamaan (dua tab, dua panitia) tidak boleh mengirim tiket dua
 * kali. Setiap putaran MENGKLAIM barisnya dulu: PATCH dengan cap unik dan
 * return=minimal, lalu membaca balik baris yang capnya miliknya (pola klaim
 * Kiriman; PATCH+select bisa kosong diam-diam di PostgREST produksi). Klaim
 * berlaku 10 menit, jadi baris yang gagal tidak diambil lagi di putaran yang
 * sama dan tidak menyumbat antrean. Lapis kedua: Idempotency-Key per
 * pendaftaran dan per percobaan, sehingga Resend sendiri menolak kiriman
 * kembar.
 *
 * Paling banyak PER_PANGGILAN orang per permintaan (batas waktu fungsi
 * serverless); layar memanggil lagi selama `sisa` > 0. `expected` di panggilan
 * pertama harus sama dengan angka di dialog, seperti Kiriman.
 */

const PER_PANGGILAN = 25;
const JEDA_MS = 600;
const MASA_KLAIM_MS = 10 * 60 * 1000;

const schema = z.object({ expected: z.number().int().min(0).optional() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!isEmailConfigured()) return apiError("EMAIL_NOT_CONFIGURED", 503);
  if (messagingAllowlist().mode === "blocked") return apiError("MESSAGING_PREVIEW_BLOCKED", 403);

  const event = auth.scope.event;
  const semua = bolehDikirim(await daftarBelumTerima(event.id));
  if (parsed.data.expected !== undefined && parsed.data.expected !== semua.length) {
    return apiError("MESSAGE_COUNT_CHANGED", 409, { count: semua.length });
  }

  const sekarang = new Date();
  const siap = semua.filter((reg) => !reg.email_claimed_until || new Date(reg.email_claimed_until) < sekarang);
  const giliran = siap.slice(0, PER_PANGGILAN);
  if (!giliran.length) return Response.json({ terkirim: 0, gagal: [], diproses: 0, sisa: 0 });

  const client = getSupabaseServiceClient();
  const cap = randomUUID();
  const { error: galatKlaim } = await client
    .from("event_registrations")
    .update({ email_claim: cap, email_claimed_until: new Date(sekarang.getTime() + MASA_KLAIM_MS).toISOString() } as never)
    .eq("event_id", event.id)
    .in("id", giliran.map((reg) => reg.id))
    .is("email_sent_at", null)
    .or(`email_claimed_until.is.null,email_claimed_until.lt.${sekarang.toISOString()}`);
  // Kolom klaim belum ada = migrasi 202610030006 belum dijalankan.
  if (galatKlaim) return apiError(galatKlaim.code === "42703" || galatKlaim.code === "PGRST204" ? "EMAIL_TEMPLATE_NOT_READY" : "INTERNAL_ERROR", galatKlaim.code === "42703" || galatKlaim.code === "PGRST204" ? 409 : 500);
  const { data: diklaim, error: galatBaca } = await client.from("event_registrations").select("id").eq("event_id", event.id).eq("email_claim", cap);
  if (galatBaca) return apiError("INTERNAL_ERROR", 500);
  const milikku = new Set(((diklaim ?? []) as { id: string }[]).map((row) => row.id));

  const origin = new URL(request.url).origin;
  let terkirim = 0;
  const gagal: { name: string; error: string }[] = [];
  let pertama = true;
  for (const reg of giliran) {
    if (!milikku.has(reg.id)) continue;
    if (!pertama) await new Promise((selesai) => setTimeout(selesai, JEDA_MS));
    pertama = false;
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
      idempotencyKey: `tally-reg-${reg.id}-qr-${reg.email_attempts}`,
    });
    if (hasil.state === "sent") terkirim += 1;
    else gagal.push({ name: reg.name, error: hasil.state === "failed" ? hasil.error : hasil.state });
  }
  // Yang gagal tercatat email_error di Pendaftaran; klaimnya menahannya 10
  // menit supaya layar tidak mengulang alamat yang sama tanpa henti.
  return Response.json({ terkirim, gagal, diproses: milikku.size, sisa: Math.max(0, siap.length - giliran.length) });
}
