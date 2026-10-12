import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { cetakSetelahHadir } from "@/lib/badge/stasiun-server";
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
  qr: z.string().trim().min(1).max(120).optional(),
  /**
   * Peserta yang dipilih dari hasil Cari nama. Pencarian tidak lagi mengirim
   * kode QR ke perangkat petugas (kode itu kunci masuk peserta), jadi yang
   * dikirim balik adalah id-nya, dan kodenya dicari di sini.
   */
  participant_id: z.string().uuid().optional(),
  // Meja tempat pemindaian ini terjadi. Opsional: acara satu meja tidak
  // mengenal jalur sama sekali, dan layar sapa tunggalnya menyapa semua orang.
  lane_id: z.number().int().positive().nullish(),
  /**
   * Stasiun cetak yang dipilih HP ini dan mode cetak otomatisnya. Diabaikan bila
   * acara tidak mencetak badge kertas di meja (lib/badge/stasiun-server.ts).
   */
  cetak: z.object({ stasiun_id: z.number().int().positive(), mode: z.enum(["off", "walkin", "semua"]) }).nullish(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  // Tepat satu: kode dari kamera, atau id dari hasil pencarian.
  if (Boolean(parsed.data.qr) === Boolean(parsed.data.participant_id)) {
    return apiError("VALIDATION_ERROR", 422, { message: "Send exactly one: a QR code or a participant." });
  }

  let qr = parsed.data.qr ?? "";
  if (parsed.data.participant_id) {
    // Peserta acara INI saja, dan bukan yang dibatalkan: aturan yang sama
    // dengan pencarian yang menampilkannya.
    const { data: peserta } = await getSupabaseServiceClient()
      .from("participants")
      .select("qr_code")
      .eq("event_id", auth.scope.event.id)
      .eq("id", parsed.data.participant_id)
      .is("source_removed_at", null)
      .maybeSingle() as { data: { qr_code: string } | null };
    if (!peserta) return apiError("VALIDATION_ERROR", 404, { message: "This participant was not found in this event. Search for the name again." });
    qr = peserta.qr_code;
  }

  const { data, error } = await getSupabaseServiceClient().rpc("record_attendance_scan" as never, {
    p_event_id: auth.scope.event.id,
    p_session_id: parsed.data.session_id,
    p_qr: qr,
    p_user: auth.user.id,
    p_lane_id: parsed.data.lane_id ?? null,
  } as never);

  if (error) {
    // Sesi yang ditutup di tengah acara adalah kejadian yang wajar — panitia
    // menutup registrasi saat acara dimulai — jadi ia dibedakan dari galat
    // sistem: petugas cukup memilih sesi lain, bukan melapor ke admin.
    const pesan = String(error.message ?? "");
    if (pesan.includes("SESSION_CLOSED")) {
      return apiError("VALIDATION_ERROR", 422, { message: "This check-in point is closed. Choose another one." });
    }
    if (pesan.includes("SESSION_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 404, { message: "Check-in point not found in this event." });
    }
    // Jalur yang hilang biasanya berarti admin menghapusnya sementara petugas
    // masih memegang pilihan lama yang tersimpan di ponselnya. Pesannya
    // menyebutkan langkah pemulihannya, bukan sekadar menyatakan salah.
    if (pesan.includes("LANE_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 422, { message: "This desk no longer exists. Choose another desk." });
    }
    return apiError("INTERNAL_ERROR", 500);
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
  return Response.json(badgeCetak ? { ...(data as object), badge_cetak: badgeCetak } : data);
}
