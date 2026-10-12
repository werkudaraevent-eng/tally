import { after } from "next/server";
import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { cetakSetelahHadir } from "@/lib/badge/stasiun-server";
import type { RegistrationFormConfig } from "@/lib/domain";
import { prepareWalkinLink } from "@/lib/member/walkin-link";
import { cleanExtra, editableFields } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { aturanWalkIn, periksaWalkIn } from "@/lib/walkin-form";

/**
 * Mendaftarkan tamu walk-in dan mencatat kehadirannya sekaligus.
 *
 * Seluruh keputusan ada di `create_walkin_participant`, bukan di sini: membuat
 * peserta dan mencatat hadir harus berada di satu transaksi, dan pemeriksaan
 * nama kembar hanya berarti bila ia dilakukan pada transaksi yang sama dengan
 * penulisannya.
 *
 * ---- Form walk-in = form registrasi utama ----------------------------------
 *
 * Kolom dan tanda wajibnya sama dengan formulir pendaftaran acara (keputusan
 * Hanung 2026-10-12): data walk-in dipakai di daftar peserta, Client view, dan
 * ekspor yang sama dengan pendaftar daring, jadi aturannya pun sama. Aturannya
 * tinggal di src/lib/walkin-form.ts, dipakai juga oleh layar pemindai, supaya
 * yang ditolak di sini selalu sudah ditandai di kolomnya di layar.
 */

const bodySchema = z.object({
  session_id: z.number().int().positive(),
  lane_id: z.number().int().positive().nullish(),
  /**
   * Stasiun cetak yang dipilih HP ini dan mode cetak otomatisnya. Diabaikan bila
   * acara tidak mencetak badge kertas di meja (lib/badge/stasiun-server.ts).
   */
  cetak: z.object({ stasiun_id: z.number().int().positive(), mode: z.enum(["off", "walkin", "semua"]) }).nullish(),
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

/** Ruang untuk email Sign-in link di after(); jawaban ke meja tidak menunggunya. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const config = auth.scope.event.registration_form_config as RegistrationFormConfig | null;
  const galatKolom = periksaWalkIn(parsed.data, aturanWalkIn(config), editableFields(config));
  if (Object.keys(galatKolom).length > 0) {
    return apiError("VALIDATION_ERROR", 422, { ...galatKolom, message: "Complete the marked fields." });
  }

  const { issues, clean } = cleanExtra(config, parsed.data.extra);
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
      return apiError("VALIDATION_ERROR", 422, { message: "This check-in point is closed. Choose another one." });
    }
    if (pesan.includes("SESSION_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 404, { message: "Check-in point not found in this event." });
    }
    if (pesan.includes("LANE_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 422, { message: "This desk no longer exists. Choose another desk." });
    }
    // Satu juta kombinasi REG###### terpakai habis, atau lima puluh tabrakan
    // berturut-turut. Menyuruh "coba lagi" adalah saran yang benar di sini —
    // percobaan berikutnya mengambil undian angka yang baru.
    if (pesan.includes("REGISTRATION_QR_EXHAUSTED")) {
      return apiError("VALIDATION_ERROR", 422, {
        message: "Could not create a new participant code. Try once more; if it still fails, contact an admin.",
      });
    }
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  // Kandidat bernama sama dikirim tanpa kode QR: petugas memilihnya lewat id,
  // sama seperti hasil Cari nama. Kode adalah kunci masuk peserta.
  const jawaban = data as { status?: string; candidates?: Array<Record<string, unknown>> } | null;
  if (jawaban?.status === "possible_duplicate") {
    return Response.json({
      ...jawaban,
      candidates: (jawaban.candidates ?? []).map((kandidat) => {
        const salinan = { ...kandidat };
        delete salinan.qr_code;
        return salinan;
      }),
    });
  }

  // Badge diantrekan SETELAH kehadiran tersimpan, di permintaan yang sama:
  // HP tidak perlu permintaan kedua yang bisa hilang di jaringan venue.
  // Gagal mengantrekan tidak menggagalkan kehadiran; HP menampilkan galatnya.
  const hasil = data as { status?: string; participant?: { id?: string } } | null;
  const badgeCetak = await cetakSetelahHadir({
    eventId: auth.scope.event.id,
    cetak: parsed.data.cetak,
    status: hasil?.status ?? "",
    participantId: hasil?.participant?.id ?? null,
    userId: auth.user.id,
    laneId: parsed.data.lane_id ?? null,
  }).catch(() => ({ pekerjaan: null, galat: "The badge could not be queued." }));
  // Email Sign-in link (sakelar Participant area, bawaan mati) juga SETELAH
  // kehadiran tersimpan. Keputusan dan tokennya dibuat di sini; emailnya
  // berangkat di after(), jadi meja tidak menunggu penyedia email. Tidak ada
  // yang melempar: check-in tetap berhasil apa pun hasilnya.
  const tautan = hasil?.status === "created" && hasil.participant?.id
    ? await prepareWalkinLink(auth.scope.event, {
      participantId: hasil.participant.id,
      email: blank(parsed.data.email),
      name: parsed.data.name,
      request,
    })
    : null;
  if (tautan?.kirim) after(tautan.kirim);
  const signinLink = tautan && !(tautan.result.state === "skipped" && tautan.result.reason === "off") ? tautan.result : null;
  const tambahan = {
    ...(badgeCetak ? { badge_cetak: badgeCetak } : {}),
    ...(signinLink ? { signin_link: signinLink } : {}),
  };
  return Response.json(Object.keys(tambahan).length > 0 ? { ...(data as object), ...tambahan } : data);
}
