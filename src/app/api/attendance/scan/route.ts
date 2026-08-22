import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Mencatat satu pemindaian kehadiran.
 *
 * Seluruh keputusan ada di RPC `record_attendance_scan`, bukan di sini: dua
 * petugas yang memindai orang yang sama pada detik yang sama harus tetap
 * menghasilkan penandaan duplikat yang benar, dan itu hanya terjamin bila
 * pemeriksaan dan penulisannya berada dalam satu transaksi.
 *
 * Handler ini hanya menjaga tiga hal: siapa yang boleh memanggil, acara mana
 * yang sedang dibuka, dan menerjemahkan galat database menjadi pesan yang bisa
 * ditindaklanjuti petugas yang sedang berdiri di pintu masuk.
 */

const bodySchema = z.object({
  session_id: z.number().int().positive(),
  // QR peserta apa adanya. Dibersihkan di database, bukan di sini, supaya aturan
  // pemangkasan spasi hanya ada di satu tempat.
  qr: z.string().trim().min(1).max(120),
  // Meja tempat pemindaian ini terjadi. Opsional: acara satu meja tidak
  // mengenal jalur sama sekali, dan layar sapa tunggalnya menyapa semua orang.
  lane_id: z.number().int().positive().nullish(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("record_attendance_scan" as never, {
    p_event_id: auth.scope.event.id,
    p_session_id: parsed.data.session_id,
    p_qr: parsed.data.qr,
    p_user: auth.user.id,
    p_lane_id: parsed.data.lane_id ?? null,
  } as never);

  if (error) {
    // Sesi yang ditutup di tengah acara adalah kejadian yang wajar — panitia
    // menutup registrasi saat acara dimulai — jadi ia dibedakan dari galat
    // sistem: petugas cukup memilih sesi lain, bukan melapor ke admin.
    const pesan = String(error.message ?? "");
    if (pesan.includes("SESSION_CLOSED")) {
      return apiError("VALIDATION_ERROR", 422, { message: "Sesi ini sudah ditutup. Pilih sesi lain." });
    }
    if (pesan.includes("SESSION_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 404, { message: "Sesi tidak ditemukan di acara ini." });
    }
    // Jalur yang hilang biasanya berarti admin menghapusnya sementara petugas
    // masih memegang pilihan lama yang tersimpan di ponselnya. Pesannya
    // menyebutkan langkah pemulihannya, bukan sekadar menyatakan salah.
    if (pesan.includes("LANE_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 422, { message: "Jalur ini sudah tidak ada. Pilih jalur lain di atas." });
    }
    return apiError("INTERNAL_ERROR", 500);
  }

  return Response.json(data);
}
