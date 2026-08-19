/**
 * Transport email. Resend, lewat `fetch` biasa.
 *
 * TANPA dependensi `resend`. Yang dibutuhkan aplikasi ini dari Resend hanya
 * satu endpoint dengan enam field, dan paket resminya tidak menambah kemampuan
 * apa pun di atas itu -- ia menambah satu paket lagi yang harus diikuti
 * versinya dan satu permukaan lagi yang harus dipercaya. Kalau kelak perlu
 * webhook status kirim atau audiens, keputusannya ditinjau ulang; hari ini
 * belum.
 *
 * Fungsi ini SENGAJA tidak pernah melempar. Pemanggilnya adalah jalur
 * persetujuan pendaftaran, dan email yang gagal terkirim tidak boleh
 * membatalkan peserta yang sudah sah dibuat. Kegagalan dikembalikan sebagai
 * nilai supaya pemanggil menyimpannya, menampilkannya, dan menyediakan tombol
 * kirim ulang -- bukan menelannya diam-diam.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Batas tunggu. Tanpa ini, penyedia yang menggantung ikut menggantung request persetujuan. */
const TIMEOUT_MS = 10_000;

export type EmailAttachment = {
  filename: string;
  /** Isi berkas dalam base64, tanpa prefiks data URL. */
  content: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export type EmailConfig = {
  apiKey: string;
  /** Alamat pengirim, format `Nama <alamat@domain>`. Domainnya wajib sudah diverifikasi di Resend. */
  from: string;
  replyTo: string | null;
};

/**
 * Konfigurasi email, atau null bila belum disetel.
 *
 * Dibaca setiap panggilan, bukan dibekukan sebagai konstanta modul: `src/lib/env.ts`
 * memakai `z.parse` di tingkat modul, dan menambahkan dua variabel ini ke sana
 * membuat SELURUH aplikasi gagal start hanya karena email belum dikonfigurasi.
 * Email adalah fitur tambahan; ketiadaannya harus mematikan satu fitur, bukan
 * seluruh acara.
 */
export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO?.trim() || null };
}

export function isEmailConfigured() {
  return emailConfig() !== null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}): Promise<SendResult> {
  const config = emailConfig();
  // Dibedakan dari kegagalan jaringan dengan sengaja: pemanggil memakai ini
  // untuk memutuskan apakah menampilkan "gagal terkirim" (yang menyuruh panitia
  // mencoba lagi) atau "pengiriman email belum diaktifkan" (yang menyuruh
  // pemilik sistem mengisi env).
  if (!config) return { ok: false, error: "EMAIL_NOT_CONFIGURED" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok) {
      // Pesan penyedia disertakan apa adanya, dipotong: ia yang menyebutkan
      // sebab sebenarnya ("domain bukan milik Anda", "alamat tidak valid"), dan
      // menggantinya dengan teks sendiri membuat panitia mengulang percobaan
      // yang tidak akan pernah berhasil.
      const detail = body?.message ?? body?.name ?? `HTTP ${response.status}`;
      return { ok: false, error: detail.slice(0, 300) };
    }
    if (!body?.id) return { ok: false, error: "Penyedia email membalas tanpa id kiriman." };
    return { ok: true, id: body.id };
  } catch (error) {
    // AbortSignal.timeout melempar TimeoutError; dibedakan karena tindak
    // lanjutnya berbeda -- yang ini layak dicoba ulang apa adanya.
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError") return { ok: false, error: "Penyedia email tidak membalas dalam 10 detik." };
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Gagal menghubungi penyedia email." };
  }
}
