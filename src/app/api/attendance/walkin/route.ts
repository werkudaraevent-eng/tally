import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { cleanExtra } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Mendaftarkan tamu walk-in dan mencatat kehadirannya sekaligus.
 *
 * Seluruh keputusan ada di `create_walkin_participant`, bukan di sini: membuat
 * peserta dan mencatat hadir harus berada di satu transaksi, dan pemeriksaan
 * nama kembar hanya berarti bila ia dilakukan pada transaksi yang sama dengan
 * penulisannya.
 *
 * ---- Kenapa jawaban formulir DIPERIKSA tapi tidak DIWAJIBKAN ---------------
 *
 * Field bertanda wajib tetap dikirim ke layar petugas supaya terlihat, tetapi
 * kosongnya tidak menahan penyimpanan. Yang berdiri di depan meja adalah antrean
 * yang bergerak, dan satu kolom "ukuran kaus" yang belum dijawab bukan alasan
 * untuk menahan seorang tamu di pintu masuk — jawabannya bisa dilengkapi di
 * halaman peserta setelah acara ramai lewat. Yang tetap ditegakkan adalah
 * bentuknya: pilihan di luar daftar dropdown tetap ditolak, karena jawaban
 * seperti itu tidak akan pernah cocok dengan formulir mana pun.
 */

const bodySchema = z.object({
  session_id: z.number().int().positive(),
  lane_id: z.number().int().positive().nullish(),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(300).nullish(),
  title: z.string().trim().max(300).nullish(),
  email: z.string().trim().max(320).email().nullish().or(z.literal("")),
  phone: z.string().trim().max(50).nullish(),
  extra: z.record(z.string().max(2000)).optional(),
  /**
   * Petugas sudah melihat daftar nama kembar dan menegaskan ini orang lain.
   * Tanpa ini, fungsi database menolak menulis dan mengembalikan kandidatnya.
   */
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { issues, clean } = cleanExtra(
    auth.scope.event.registration_form_config as RegistrationFormConfig | null,
    parsed.data.extra,
  );
  if (issues.length > 0) {
    return apiError("VALIDATION_ERROR", 422, Object.fromEntries(issues.map((issue) => [`extra.${issue.key}`, issue.message])));
  }

  const blank = (value: string | null | undefined) => (value == null || value === "" ? null : value);

  const { data, error } = await getSupabaseServiceClient().rpc("create_walkin_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_session_id: parsed.data.session_id,
    p_name: parsed.data.name,
    p_company: blank(parsed.data.company),
    p_title: blank(parsed.data.title),
    p_email: blank(parsed.data.email),
    p_phone: blank(parsed.data.phone),
    p_extra: clean,
    p_user: auth.user.id,
    p_lane_id: parsed.data.lane_id ?? null,
    p_force: parsed.data.force ?? false,
  } as never);

  if (error) {
    const pesan = String(error.message ?? "");
    // Sesi yang ditutup dan jalur yang hilang dijawab persis seperti di
    // /api/attendance/scan. Petugas yang berpindah antara memindai dan
    // mendaftarkan tidak boleh membaca dua kalimat berbeda untuk sebab yang sama.
    if (pesan.includes("SESSION_CLOSED")) {
      return apiError("VALIDATION_ERROR", 422, { message: "Sesi ini sudah ditutup. Pilih sesi lain." });
    }
    if (pesan.includes("SESSION_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 404, { message: "Sesi tidak ditemukan di acara ini." });
    }
    if (pesan.includes("LANE_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 422, { message: "Jalur ini sudah tidak ada. Pilih jalur lain di atas." });
    }
    // Satu juta kombinasi REG###### terpakai habis, atau lima puluh tabrakan
    // berturut-turut. Menyuruh "coba lagi" adalah saran yang benar di sini —
    // percobaan berikutnya mengambil undian angka yang baru.
    if (pesan.includes("REGISTRATION_QR_EXHAUSTED")) {
      return apiError("VALIDATION_ERROR", 422, {
        message: "Gagal membuat kode peserta baru. Coba sekali lagi; bila tetap gagal, hubungi admin.",
      });
    }
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  return Response.json(data);
}
