import QRCode from "qrcode";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { confirmationUrlIn, registrationCodeUrlIn } from "@/lib/registration-code-url";
import { isEmailConfigured, sendEmail } from "./client";
import type { EventTimeZone } from "@/lib/timezone";
import type { FieldKey } from "@/lib/pesan/bawaan";
import { bahasaEmail, type EmailLang } from "./konfirmasi/bahasa";
import { bahanKonfirmasi, type BahanKonfirmasi } from "./konfirmasi/konteks";
import { renderKonfirmasi, type RenderContext } from "./konfirmasi/render";
import { defaultTemplat } from "./konfirmasi/templat";

/**
 * Kirim kode peserta ke pendaftar yang disetujui, lalu catat hasilnya.
 *
 * BEST EFFORT, selalu. Fungsi ini dipanggil setelah peserta benar-benar dibuat
 * di database; kegagalannya tidak boleh membatalkan apa pun yang sudah terjadi.
 * Karena itu ia tidak melempar, dan pemanggilnya memasukkan hasilnya ke dalam
 * jawaban sebagai keterangan tambahan -- bukan sebagai penentu status HTTP.
 *
 * Kode tetap ditampilkan di layar sukses pendaftar DAN di layar moderasi
 * panitia, apa pun hasil di sini. Email adalah salinan kedua, bukan satu-satunya
 * jalan kode itu sampai; itulah yang membuatnya aman dikerjakan tanpa antrean
 * dan tanpa percobaan ulang otomatis.
 */

export type EmailDelivery =
  | { state: "sent" }
  /** Sakelar email Menunggu persetujuan acara ini mati. */
  | { state: "disabled" }
  | { state: "failed"; error: string }
  | { state: "not_configured" };

type Input = {
  eventId: string;
  registrationId: string;
  eventName: string;
  eventDate: string | null;
  timeZone: EventTimeZone;
  /** Alamat tujuan. Sudah di-lowercase dan divalidasi saat pendaftaran masuk. */
  to: string;
  name: string;
  qrCode: string;
  /**
   * Alamat lengkap halaman kode permanen.
   *
   * Disebutkan di email karena lampiran QR tidak selalu selamat: klien email
   * perusahaan membuang lampiran gambar, dan email yang diteruskan sering
   * kehilangan lampirannya. Tautan ini tetap membawa pendaftar ke QR-nya.
   */
  codeUrl?: string | null;
  actorId?: string | null;
  company?: string | null;
  /** Origin permintaan: tautan di email (kalender, dashboard) memakai alamat yang sama dengan yang dibuka pendaftar. */
  origin: string;
  /** Tautan konfirmasi akun Area peserta yang baru dibuat; ikut di email ini (lihat RenderContext.akunUrl). */
  akunUrl?: string | null;
  /** Lihat sendEmail. Hanya "Kirim ke mereka…" yang mengisinya. */
  idempotencyKey?: string;
  /** Bahasa formulir yang baru disimpan (pendaftaran baru); selain itu dibaca dari barisnya. */
  lang?: EmailLang;
};

export async function sendRegistrationCode(input: Input): Promise<EmailDelivery> {
  // Keluar SEBELUM menyentuh database. Menaikkan email_attempts untuk
  // lingkungan yang memang belum punya kunci API membuat "sudah 3 kali dicoba
  // dan gagal" berbohong: tidak ada satu pun percobaan yang benar-benar terjadi.
  if (!isEmailConfigured()) return { state: "not_configured" };

  const bahan = await bahanKonfirmasi(input.eventId, input.origin);
  if (!bahan) return { state: "failed", error: "Acara tidak ditemukan." };

  let qrPng: string | null = null;
  try {
    // QR ditanam inline (cid), bukan gambar dari server: gambar jarak jauh
    // diblokir banyak klien email secara bawaan. Kode teksnya tetap jalur
    // yang pasti terbaca; QR ini kenyamanan tambahan.
    qrPng = (await QRCode.toBuffer(input.qrCode, { errorCorrectionLevel: "H", margin: 4, width: 480, color: { dark: "#000000", light: "#FFFFFF" } })).toString("base64");
  } catch {
    // QR gagal digambar bukan alasan membatalkan email: kode teksnya sendiri
    // sudah cukup untuk dicocokkan panitia di meja registrasi.
    qrPng = null;
  }

  const dasar = bahan.konteks(await bahasaPendaftar(bahan, input.registrationId, input.lang));
  const email = susunAman(bahan, {
    ...dasar,
    state: "approved",
    values: nilaiKolom(dasar.eventName, dasar.detail.tanggal, input.name, input.company ?? null, dasar.lang),
    qr: { code: input.qrCode, src: qrPng ? `cid:${QR_CID}` : null },
    codeUrl: registrationCodeUrlIn(input.codeUrl, bahan.event.slug, dasar.lang, bahan.bahasaUtama, bahan.enTersedia),
    akunUrl: confirmationUrlIn(input.akunUrl, dasar.lang, bahan.bahasaUtama, bahan.enTersedia),
  });

  const hasil = await sendEmail({
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: qrPng
      ? [{ filename: `kode-peserta-${input.qrCode}.png`, content: qrPng, content_id: QR_CID }]
      : [],
  });

  // Pencatatan dilakukan lewat RPC supaya email_attempts naik atomik dan satu
  // baris audit ikut tertulis dalam transaksi yang sama.
  const { error } = await getSupabaseServiceClient().rpc("record_registration_email" as never, {
    p_event_id: input.eventId,
    p_registration_id: input.registrationId,
    p_ok: hasil.ok,
    p_error: hasil.ok ? null : hasil.error,
    p_actor: input.actorId ?? null,
  } as never);
  // Gagal mencatat TIDAK mengubah kenyataan bahwa emailnya terkirim. Melaporkan
  // "gagal" di sini akan membuat panitia mengirim ulang email yang sudah sampai.
  if (error) console.error("record_registration_email gagal:", error);

  return hasil.ok ? { state: "sent" } : { state: "failed", error: hasil.error };
}

/**
 * Email "Pendaftaran diterima" untuk acara bermoderasi: templat yang sama,
 * kartu Tiket diganti kotak Menunggu persetujuan. Tidak menyentuh
 * email_sent_at (kolom itu milik email ber-QR), cukup satu baris audit.
 */
export async function sendRegistrationReceived(input: {
  eventId: string;
  registrationId: string;
  to: string;
  name: string;
  company?: string | null;
  requestUrl: string;
  akunUrl?: string | null;
  lang?: EmailLang;
}): Promise<EmailDelivery> {
  return kirimTanpaQr("pending", input);
}

/**
 * Email "Tidak disetujui" saat panitia menolak. Hanya bila sakelarnya
 * dinyalakan di Email otomatis (bawaan mati). Alasan penolakan TIDAK ikut:
 * kolom itu catatan internal panitia.
 */
export async function sendRegistrationRejected(input: {
  eventId: string;
  registrationId: string;
  to: string;
  name: string;
  company?: string | null;
  requestUrl: string;
  actorId?: string | null;
}): Promise<EmailDelivery> {
  return kirimTanpaQr("rejected", input);
}

async function kirimTanpaQr(
  state: "pending" | "rejected",
  input: { eventId: string; registrationId: string; to: string; name: string; company?: string | null; requestUrl: string; akunUrl?: string | null; actorId?: string | null; lang?: EmailLang },
): Promise<EmailDelivery> {
  if (!isEmailConfigured()) return { state: "not_configured" };
  const bahan = await bahanKonfirmasi(input.eventId, new URL(input.requestUrl).origin);
  if (!bahan) return { state: "failed", error: "Acara tidak ditemukan." };
  if (state === "pending" ? !bahan.kirimMenunggu : !bahan.templat.kirim_ditolak) return { state: "disabled" };
  const dasar = bahan.konteks(await bahasaPendaftar(bahan, input.registrationId, input.lang));
  const email = susunAman(bahan, {
    ...dasar,
    state,
    values: nilaiKolom(dasar.eventName, dasar.detail.tanggal, input.name, input.company ?? null, dasar.lang),
    qr: null,
    codeUrl: null,
    akunUrl: confirmationUrlIn(input.akunUrl, dasar.lang, bahan.bahasaUtama, bahan.enTersedia),
  });
  const hasil = await sendEmail({ eventId: input.eventId, to: input.to, subject: email.subject, html: email.html, text: email.text });
  const jenis = state === "pending" ? "registration_received_email" : "registration_rejected_email";
  await getSupabaseServiceClient().from("audit_logs").insert({
    event_id: input.eventId,
    user_id: input.actorId ?? null,
    action: `${jenis}_${hasil.ok ? "sent" : "failed"}`,
    payload: { registration_id: input.registrationId, email: input.to, error: hasil.ok ? null : hasil.error },
  } as never);
  return hasil.ok ? { state: "sent" } : { state: "failed", error: hasil.error };
}

const QR_CID = "kode-peserta-qr";

/**
 * Bahasa email untuk satu pendaftaran: aturan "Email language" acara, lalu
 * bahasa formulir yang tersimpan. NULL, kolom belum ada (migrasi belum jalan),
 * atau gagal dibaca = Indonesia, supaya kirim ulang pendaftar lama tidak
 * berubah bahasa.
 */
async function bahasaPendaftar(bahan: BahanKonfirmasi, registrationId: string, baru?: EmailLang): Promise<EmailLang> {
  const aturan = bahan.templat.bahasa;
  if (aturan !== "ikuti") return aturan;
  if (baru) return baru;
  const { data, error } = await getSupabaseServiceClient().from("event_registrations").select("language").eq("id", registrationId).maybeSingle();
  if (error) return "id";
  return bahasaEmail(aturan, (data as { language: string | null } | null)?.language ?? null);
}

/**
 * Templat panitia bila bisa disusun; bila tidak (data lama yang aneh, bug
 * penyusun), templat bawaan acara. Pendaftar tetap menerima email; panitia
 * melihat jejaknya di log server.
 */
function susunAman(bahan: BahanKonfirmasi, ctx: RenderContext) {
  try {
    return renderKonfirmasi(bahan.templat, ctx);
  } catch (error) {
    console.error("Templat email konfirmasi gagal disusun, memakai bawaan:", error);
    return renderKonfirmasi(defaultTemplat({ punyaKv: false, memberOn: bahan.memberOn }), ctx);
  }
}

export function nilaiKolom(acara: string, tanggal: string | null, nama: string, perusahaan: string | null, lang: EmailLang = "id"): Record<FieldKey, string> {
  return { nama: nama.trim() || (lang === "en" ? "Participant" : "Peserta"), perusahaan: perusahaan?.trim() || "", acara, tanggal: tanggal ?? "" };
}

/**
 * Nama acara dan nama pendaftar berasal dari isian bebas, dan keduanya masuk ke
 * badan HTML. Tanpa ini, seorang pendaftar dapat menuliskan tag di kolom nama
 * dan email yang diterima berisi tautan yang tidak pernah ditulis panitia.
 */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
