import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { sendRegistrationCode } from "@/lib/email/registration-code";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kirim ulang kode peserta ke satu pendaftar.
 *
 * SATU baris per permintaan, tanpa versi massal. Email massal punya kegagalan
 * yang tidak dimiliki pengiriman satuan: satu klik salah mengirim ratusan email
 * yang tidak dapat ditarik kembali, dan lonjakan mendadak membuat penyedia
 * menandai domain acara sebagai spam — sehingga pendaftar BERIKUTNYA pun tidak
 * menerima apa pun. Panitia yang benar-benar perlu mengirim ulang ke banyak
 * orang menekannya beberapa kali; itu lebih lambat, dan tidak apa-apa.
 *
 * Route terpisah, bukan aksi tambahan di POST /api/admin/registrasi. Route itu
 * memutuskan nasib pendaftaran (setuju/tolak); menumpangkan aksi yang tidak
 * mengubah status apa pun ke sana membuat satu badan permintaan punya dua arti
 * yang sangat berbeda, dan salah kirim di antaranya menyetujui orang yang
 * seharusnya hanya dikirimi ulang emailnya.
 */

const bodySchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // Diperiksa lebih dulu supaya jawabannya menyebut sebab yang benar. Tanpa
  // ini, lingkungan tanpa kunci API menjawab "gagal terkirim" dan panitia akan
  // mencoba lagi sampai menyerah.
  if (!isEmailConfigured()) return apiError("EMAIL_NOT_CONFIGURED", 422);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_registrations")
    .select("id,name,email,status,participant_id")
    // event_id ikut disaring, bukan sekadar id: admin event A yang menempelkan
    // id dari event B tidak boleh bisa memicu pengiriman di event lain.
    .eq("id", parsed.data.id)
    .eq("event_id", auth.scope.event.id)
    .maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);

  const reg = data as { id: string; name: string; email: string; status: string; participant_id: string | null } | null;
  if (!reg) return apiError("REGISTRATION_NOT_FOUND", 404);
  // participant_id boleh kosong meski status 'approved' — kolomnya
  // `on delete set null`, jadi peserta yang sudah dihapus meninggalkan baris
  // approved tanpa peserta. Tidak ada kode untuk dikirim dalam keadaan itu.
  if (reg.status !== "approved" || !reg.participant_id) return apiError("REGISTRATION_NOT_APPROVED", 422);

  const { data: peserta } = await client
    .from("participants")
    .select("qr_code")
    .eq("id", reg.participant_id)
    .maybeSingle();
  const qrCode = (peserta as { qr_code: string } | null)?.qr_code;
  if (!qrCode) return apiError("REGISTRATION_NOT_APPROVED", 422);

  const kirim = await sendRegistrationCode({
    eventId: auth.scope.event.id,
    registrationId: reg.id,
    eventName: auth.scope.event.name,
    eventDate: auth.scope.event.event_date,
    timeZone: auth.scope.event.time_zone,
    to: reg.email,
    name: reg.name,
    qrCode,
    actorId: auth.user.id,
  });

  // Kegagalan DILAPORKAN sebagai galat di sini, berbeda dari jalur persetujuan.
  // Di sana emailnya hanya efek samping dari tindakan yang sudah berhasil; di
  // sini pengiriman itulah seluruh isi permintaannya, jadi 200 untuk email yang
  // tidak terkirim adalah kebohongan.
  if (kirim.state !== "sent") {
    return apiError("EMAIL_SEND_FAILED", 422, {
      message: kirim.state === "failed" ? `Email gagal dikirim: ${kirim.error}` : undefined,
    });
  }

  return Response.json({ email: kirim, to: reg.email });
}
