import QRCode from "qrcode";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isEmailConfigured, sendEmail } from "./client";
import type { EventTimeZone } from "@/lib/timezone";

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
  actorId?: string | null;
};

export async function sendRegistrationCode(input: Input): Promise<EmailDelivery> {
  // Keluar SEBELUM menyentuh database. Menaikkan email_attempts untuk
  // lingkungan yang memang belum punya kunci API membuat "sudah 3 kali dicoba
  // dan gagal" berbohong: tidak ada satu pun percobaan yang benar-benar terjadi.
  if (!isEmailConfigured()) return { state: "not_configured" };

  const tanggal = formatTanggal(input.eventDate, input.timeZone);
  let lampiran: { filename: string; content: string }[] = [];
  try {
    // QR sebagai LAMPIRAN, bukan <img> di badan email. Gambar jarak jauh
    // diblokir sebagian besar klien email secara bawaan, dan QR yang tidak
    // tampil di meja registrasi lebih buruk daripada tidak ada QR sama sekali.
    // Kode teksnya di bawah adalah jalur yang pasti terbaca; lampiran ini
    // kenyamanan tambahan.
    const png = await QRCode.toBuffer(input.qrCode, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 512,
    });
    lampiran = [{ filename: `kode-peserta-${input.qrCode}.png`, content: png.toString("base64") }];
  } catch {
    // QR gagal digambar bukan alasan membatalkan email: kode teksnya sendiri
    // sudah cukup untuk dicocokkan panitia di meja registrasi.
    lampiran = [];
  }

  const hasil = await sendEmail({
    to: input.to,
    subject: `Kode peserta Anda — ${input.eventName}`,
    html: htmlBody({ ...input, tanggal }),
    text: textBody({ ...input, tanggal }),
    attachments: lampiran,
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

function formatTanggal(eventDate: string | null, timeZone: EventTimeZone) {
  if (!eventDate) return null;
  // T12:00:00Z, pola yang sama dengan halaman-halaman lain: tanggal tanpa jam
  // yang diurai sebagai tengah malam UTC akan mundur satu hari di zona WIB/WITA/WIT.
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone })
    .format(new Date(`${eventDate}T12:00:00Z`));
}

type Body = Input & { tanggal: string | null };

/**
 * HTML email, gaya inline dan tabel-bebas.
 *
 * Tanpa `<style>`, tanpa kelas, tanpa flexbox/grid: Gmail membuang blok style di
 * `<head>`, dan Outlook desktop merender lewat mesin Word yang tidak mengenal
 * tata letak modern. Yang tersisa aman di semua klien adalah `<div>` bertumpuk
 * dengan atribut `style` -- membosankan, dan terbaca di mana saja.
 */
function htmlBody(b: Body) {
  return `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">Pendaftaran peserta</p>
    <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;font-weight:600;">${escapeHtml(b.eventName)}</h1>
    ${b.tanggal ? `<p style="margin:8px 0 0;font-size:14px;color:#66736C;">${escapeHtml(b.tanggal)}</p>` : ""}

    <p style="margin:28px 0 0;font-size:15px;line-height:1.6;">Halo ${escapeHtml(b.name)}, pendaftaran Anda sudah disetujui panitia.</p>

    <div style="margin:24px 0 0;border:1px solid #D9DDD7;background:#EDECE6;padding:24px;text-align:center;">
      <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#66736C;font-weight:600;">Kode peserta</p>
      <p style="margin:10px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;letter-spacing:0.1em;font-weight:600;">${escapeHtml(b.qrCode)}</p>
    </div>

    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;">Tunjukkan kode ini di meja registrasi saat hari acara. QR-nya juga terlampir di email ini sebagai berkas gambar, tinggal ditunjukkan dari layar ponsel.</p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#66736C;">Kode ini khusus untuk Anda. Jangan diteruskan ke orang lain — kode yang sama tidak bisa dipakai dua orang.</p>

    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">Email ini dikirim otomatis dan tidak perlu dibalas. Ada pertanyaan? Hubungi panitia acara.</p>
  </div>
</body></html>`;
}

/**
 * Versi teks. Bukan formalitas: sebagian klien perusahaan menampilkan bagian
 * teks apa adanya, dan email tanpa bagian teks lebih sering dinilai spam oleh
 * penyaring.
 */
function textBody(b: Body) {
  return [
    b.eventName,
    b.tanggal ?? "",
    "",
    `Halo ${b.name}, pendaftaran Anda sudah disetujui panitia.`,
    "",
    `KODE PESERTA: ${b.qrCode}`,
    "",
    "Tunjukkan kode ini di meja registrasi saat hari acara. QR-nya juga terlampir sebagai berkas gambar.",
    "Kode ini khusus untuk Anda. Jangan diteruskan ke orang lain.",
    "",
    "Email ini dikirim otomatis dan tidak perlu dibalas.",
  ].filter((baris, index) => baris !== "" || index > 0).join("\n");
}

/**
 * Nama acara dan nama pendaftar berasal dari isian bebas, dan keduanya masuk ke
 * badan HTML. Tanpa ini, seorang pendaftar dapat menuliskan tag di kolom nama
 * dan email yang diterima berisi tautan yang tidak pernah ditulis panitia.
 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
