import { isEmailConfigured, sendEmail } from "./client";
import { escapeHtml } from "./registration-code";

/**
 * Email tautan area peserta: konfirmasi email, dan buat/atur ulang kata sandi.
 *
 * Best effort seperti email kode peserta: tidak melempar, pemanggil yang
 * memutuskan apa yang dikatakan ke peserta bila gagal.
 */

export type MemberLinkKind = "konfirmasi" | "sandi" | "tertutup";

const ISI: Record<MemberLinkKind, { subjek: (acara: string) => string; pembuka: string; tombol: string | null; catatan: string }> = {
  konfirmasi: {
    subjek: (acara) => `Konfirmasi email Anda — ${acara}`,
    pembuka: "akun area peserta Anda sudah dibuat. Konfirmasi bahwa email ini milik Anda, supaya akun bisa dipulihkan bila Anda lupa kata sandi.",
    tombol: "Konfirmasi email",
    catatan: "Tautan ini berlaku 14 hari. Bila Anda tidak mendaftar, abaikan email ini.",
  },
  sandi: {
    subjek: (acara) => `Buat kata sandi area peserta — ${acara}`,
    pembuka: "gunakan tautan di bawah untuk membuat kata sandi area peserta. Tautan yang sama dipakai bila Anda lupa kata sandi.",
    tombol: "Buat kata sandi",
    catatan: "Tautan ini berlaku 60 menit dan hanya bisa dipakai sekali. Bila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.",
  },
  // Peserta terdaftar yang aksesnya belum dibuka panitia. Tanpa tombol.
  tertutup: {
    subjek: (acara) => `Area peserta — ${acara}`,
    pembuka: "ada permintaan tautan kata sandi area peserta untuk email ini. Email ini terdaftar sebagai peserta, tetapi area peserta belum dibuka untuk Anda. Hubungi panitia acara bila Anda memerlukan akses.",
    tombol: null,
    catatan: "Bila Anda tidak memintanya, abaikan email ini.",
  },
};

export async function sendMemberLink(input: {
  /** Acara pengirim, untuk nama pengirim dan reply-to. */
  eventId: string;
  kind: MemberLinkKind;
  to: string;
  name: string | null;
  eventName: string;
  url: string | null;
}): Promise<{ state: "sent" } | { state: "failed"; error: string } | { state: "not_configured" }> {
  if (!isEmailConfigured()) return { state: "not_configured" };
  const isi = ISI[input.kind];
  const sapaan = input.name?.trim() ? `Halo ${input.name.trim()}, ` : "Halo, ";

  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">Area peserta</p>
    <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;font-weight:600;">${escapeHtml(input.eventName)}</h1>
    <p style="margin:28px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(sapaan + isi.pembuka)}</p>
    ${input.url && isi.tombol ? `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:14px 28px;background:#2649D0;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${isi.tombol}</a></p>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#66736C;">Tombol tidak bisa diklik? Salin alamat ini ke peramban:<br><span style="word-break:break-all;">${escapeHtml(input.url)}</span></p>` : ""}
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">${escapeHtml(isi.catatan)}</p>
  </div>
</body></html>`;

  const text = [
    input.eventName,
    "",
    sapaan + isi.pembuka,
    "",
    ...(input.url && isi.tombol ? [`${isi.tombol}: ${input.url}`, ""] : []),
    isi.catatan,
  ].join("\n");

  const hasil = await sendEmail({ eventId: input.eventId, to: input.to, subject: isi.subjek(input.eventName), html, text });
  return hasil.ok ? { state: "sent" } : { state: "failed", error: hasil.error };
}
