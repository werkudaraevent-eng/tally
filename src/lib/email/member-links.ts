import { isEmailConfigured, sendEmail } from "./client";
import { escapeHtml } from "./registration-code";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Email tautan area peserta: konfirmasi email, dan buat/atur ulang kata sandi.
 *
 * Best effort seperti email kode peserta: tidak melempar, pemanggil yang
 * memutuskan apa yang dikatakan ke peserta bila gagal.
 *
 * English bila diminta dari halaman English (`lang`); bawaan Indonesia,
 * isinya tidak berubah.
 */

export type MemberLinkKind = "konfirmasi" | "sandi" | "tertutup" | "walkin" | "kode";

type Isi = Record<MemberLinkKind, { subjek: (acara: string) => string; pembuka: string; tombol: string | null; catatan: string }>;

const ISI: Isi = {
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
  // Kode masuk 6 digit (Participant area > Email code). Kodenya di `kode`.
  kode: {
    subjek: (acara) => `Kode masuk area peserta — ${acara}`,
    pembuka: "ini kode untuk masuk ke area peserta. Ketik kode ini di halaman masuk.",
    tombol: null,
    catatan: "Kode ini berlaku 10 menit dan hanya bisa dipakai sekali. Jangan berikan kode ini kepada siapa pun, termasuk panitia. Bila Anda tidak memintanya, abaikan email ini.",
  },
  // Walk-in yang baru didaftarkan petugas di meja registrasi (sendWalkinLink).
  walkin: {
    subjek: (acara) => `Akses area peserta — ${acara}`,
    pembuka: "Anda sudah terdaftar di meja registrasi. Buat kata sandi lewat tombol di bawah untuk membuka tiket dan info acara Anda di area peserta.",
    tombol: "Buat kata sandi",
    catatan: "Tautan ini hanya untuk Anda, berlaku 7 hari, dan hanya bisa dipakai sekali. Jangan teruskan email ini ke orang lain.",
  },
};

const ISI_EN: Isi = {
  konfirmasi: {
    subjek: (acara) => `Confirm your email — ${acara}`,
    pembuka: "your participant area account has been created. Confirm that this email is yours, so you can recover the account if you forget your password.",
    tombol: "Confirm email",
    catatan: "This link is valid for 14 days. If you did not register, ignore this email.",
  },
  sandi: {
    subjek: (acara) => `Create your participant area password — ${acara}`,
    pembuka: "use the link below to create your participant area password. The same link works if you forget your password.",
    tombol: "Create password",
    catatan: "This link is valid for 60 minutes and works once. If you did not ask for it, ignore this email; your password has not changed.",
  },
  tertutup: {
    subjek: (acara) => `Participant area — ${acara}`,
    pembuka: "someone asked for a participant area password link for this email. This email is registered as a participant, but the participant area is not open to you yet. Contact the organisers if you need access.",
    tombol: null,
    catatan: "If you did not ask for it, ignore this email.",
  },
  kode: {
    subjek: (acara) => `Your participant area sign-in code — ${acara}`,
    pembuka: "here is your code to sign in to the participant area. Enter it on the sign-in page.",
    tombol: null,
    catatan: "This code is valid for 10 minutes and works once. Do not share it with anyone, including the organisers. If you did not ask for it, ignore this email.",
  },
  walkin: {
    subjek: (acara) => `Your participant area — ${acara}`,
    pembuka: "you have been registered at the registration desk. Create a password with the button below to open your ticket and event information in the participant area.",
    tombol: "Create password",
    catatan: "This link is only for you, is valid for 7 days and works once. Do not forward this email to anyone.",
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
  /** Kode masuk 6 digit, untuk `kind: "kode"`. */
  kode?: string;
  lang?: LandingLang;
}): Promise<{ state: "sent" } | { state: "failed"; error: string } | { state: "not_configured" }> {
  if (!isEmailConfigured()) return { state: "not_configured" };
  const en = input.lang === "en";
  const isi = (en ? ISI_EN : ISI)[input.kind];
  const sapaan = input.name?.trim() ? `${en ? "Hello" : "Halo"} ${input.name.trim()}, ` : en ? "Hello, " : "Halo, ";

  const html = `<!doctype html>
<html lang="${en ? "en" : "id"}"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">${en ? "Participant area" : "Area peserta"}</p>
    <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;font-weight:600;">${escapeHtml(input.eventName)}</h1>
    <p style="margin:28px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(sapaan + isi.pembuka)}</p>
    ${input.kode ? `<p style="margin:24px 0 0;text-align:center;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.25em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(input.kode)}</p>` : ""}
    ${input.url && isi.tombol ? `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:14px 28px;background:#2649D0;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${isi.tombol}</a></p>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#66736C;">${en ? "Button not working? Copy this address into your browser:" : "Tombol tidak bisa diklik? Salin alamat ini ke peramban:"}<br><span style="word-break:break-all;">${escapeHtml(input.url)}</span></p>` : ""}
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">${escapeHtml(isi.catatan)}</p>
  </div>
</body></html>`;

  const text = [
    input.eventName,
    "",
    sapaan + isi.pembuka,
    "",
    ...(input.kode ? [input.kode, ""] : []),
    ...(input.url && isi.tombol ? [`${isi.tombol}: ${input.url}`, ""] : []),
    isi.catatan,
  ].join("\n");

  const hasil = await sendEmail({ eventId: input.eventId, to: input.to, subject: isi.subjek(input.eventName), html, text });
  return hasil.ok ? { state: "sent" } : { state: "failed", error: hasil.error };
}
