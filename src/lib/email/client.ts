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

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fromWithName } from "./pengirim";

export { senderAddress } from "./pengirim";

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

export type EventSender = { name: string | null; replyTo: string | null };

/**
 * Pengirim per acara (Pengaturan > Acara > Pengirim email). Hanya NAMA yang
 * diganti; alamatnya tetap dari EMAIL_FROM karena domainnya harus terverifikasi
 * di Resend. Kolom kosong jatuh ke env.
 */
export function withEventSender(config: EmailConfig, sender: EventSender | null): EmailConfig {
  return {
    ...config,
    from: fromWithName(sender?.name, config.from),
    replyTo: sender?.replyTo?.trim() || config.replyTo,
  };
}

const cachePengirim = new Map<string, { nilai: EventSender | null; sampai: number }>();

/**
 * Setelan pengirim satu acara, disimpan sebentar supaya satu blast tidak
 * membaca event_settings untuk setiap potongan. Galat baca (mis. kolom belum
 * ada) = pakai env, bukan gagal kirim.
 */
export async function eventSender(eventId: string | null | undefined): Promise<EventSender | null> {
  if (!eventId) return null;
  const tersimpan = cachePengirim.get(eventId);
  if (tersimpan && tersimpan.sampai > Date.now()) return tersimpan.nilai;
  const { data, error } = await getSupabaseServiceClient()
    .from("event_settings")
    .select("email_sender_name,email_reply_to")
    .eq("event_id", eventId)
    .maybeSingle();
  const baris = data as { email_sender_name: string | null; email_reply_to: string | null } | null;
  const nilai = error || !baris ? null : { name: baris.email_sender_name, replyTo: baris.email_reply_to };
  cachePengirim.set(eventId, { nilai, sampai: Date.now() + 30_000 });
  return nilai;
}

/** Dipanggil setelah Pengaturan disimpan, supaya email berikutnya langsung memakai nama baru. */
export function forgetEventSender(eventId: string) {
  cachePengirim.delete(eventId);
}

async function configFor(eventId: string | null | undefined): Promise<EmailConfig | null> {
  const config = emailConfig();
  if (!config) return null;
  return withEventSender(config, await eventSender(eventId).catch(() => null));
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Acara pengirim: nama pengirim dan reply-to diambil dari setelannya. */
  eventId?: string | null;
}): Promise<SendResult> {
  const config = await configFor(input.eventId);
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

/** Batas Resend per panggilan /emails/batch. */
export const BATCH_MAX = 100;

/**
 * Banyak email sekaligus lewat /emails/batch (paling banyak 100 per panggilan),
 * untuk pengumuman panitia ke semua akun peserta. Satu email per penerima,
 * jadi alamat penerima lain tidak pernah terlihat. Tidak melempar, sama dengan
 * sendEmail; yang dikembalikan hitungan terkirim dan gagal.
 */
export async function sendEmailBatch(
  messages: { to: string; subject: string; html: string; text: string }[],
  eventId?: string | null,
): Promise<{ sent: number; failed: number; error: string | null } | { notConfigured: true }> {
  const config = await configFor(eventId);
  if (!config) return { notConfigured: true };
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (let i = 0; i < messages.length; i += BATCH_MAX) {
    const potongan = messages.slice(i, i + BATCH_MAX);
    try {
      const response = await fetch(`${ENDPOINT}/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          potongan.map((pesan) => ({
            from: config.from,
            to: [pesan.to],
            subject: pesan.subject,
            html: pesan.html,
            text: pesan.text,
            ...(config.replyTo ? { reply_to: config.replyTo } : {}),
          })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS * 2),
      });
      if (response.ok) {
        sent += potongan.length;
      } else {
        const body = (await response.json().catch(() => null)) as { message?: string; name?: string } | null;
        failed += potongan.length;
        lastError = (body?.message ?? body?.name ?? `HTTP ${response.status}`).slice(0, 300);
      }
    } catch (error) {
      failed += potongan.length;
      lastError = error instanceof Error ? error.message.slice(0, 300) : "Gagal menghubungi penyedia email.";
    }
  }
  return { sent, failed, error: lastError };
}

export type BatchItem = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/** Hasil per email, urutannya sama dengan masukan. */
export type BatchItemResult = { ok: true; id: string } | { ok: false; error: string; permanent: boolean };

export type DetailedBatchResult =
  | { kind: "not_configured" }
  /** Penyedia menolak seluruh panggilan (atau tidak membalas). `retryable` = layak dicoba lagi apa adanya. */
  | { kind: "failed"; error: string; retryable: boolean; status: number | null }
  | { kind: "ok"; items: BatchItemResult[] };

/**
 * Satu potongan (paling banyak 100) lewat /emails/batch untuk mesin Pesan
 * peserta. Berbeda dari sendEmailBatch di atas dalam tiga hal:
 *
 *   * `Idempotency-Key`: potongan yang dikirim ulang dengan kunci yang sama
 *     dalam 24 jam tidak terkirim dua kali; Resend membalas hasil yang lama.
 *   * `x-batch-validation: permissive`: satu alamat buruk tidak menggagalkan
 *     99 lainnya. Yang gagal validasi dikembalikan per indeks.
 *   * Hasilnya per email, sesuai urutan masukan, supaya setiap baris penerima
 *     bisa diberi id kiriman atau alasan gagalnya sendiri.
 */
export async function sendEmailBatchDetailed(items: BatchItem[], idempotencyKey: string, eventId?: string | null): Promise<DetailedBatchResult> {
  const config = await configFor(eventId);
  if (!config) return { kind: "not_configured" };
  if (items.length === 0) return { kind: "ok", items: [] };
  if (items.length > BATCH_MAX) throw new Error(`Paling banyak ${BATCH_MAX} email per potongan.`);

  try {
    const response = await fetch(`${ENDPOINT}/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "x-batch-validation": "permissive",
      },
      body: JSON.stringify(
        items.map((item) => ({
          from: config.from,
          to: [item.to],
          subject: item.subject,
          html: item.html,
          text: item.text,
          ...(config.replyTo ? { reply_to: config.replyTo } : {}),
          ...(item.headers ? { headers: item.headers } : {}),
        })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: { id: string }[]; errors?: { index: number; message: string }[]; message?: string; name?: string }
      | null;

    if (!response.ok) {
      const error = (body?.message ?? body?.name ?? `HTTP ${response.status}`).slice(0, 300);
      // 429 dan 5xx: penyedia sibuk, coba lagi nanti. 4xx lain (kunci API salah,
      // domain belum diverifikasi, kunci idempotensi dipakai untuk isi lain):
      // mengulang apa adanya tidak akan menolong.
      return { kind: "failed", error, retryable: response.status === 429 || response.status >= 500, status: response.status };
    }

    // Dalam mode permissive, `data` hanya berisi email yang diterima, berurutan;
    // `errors` menyebut indeks yang ditolak. Keduanya digabung kembali ke urutan
    // masukan.
    const ditolak = new Map((body?.errors ?? []).map((galat) => [galat.index, galat.message]));
    const diterima = [...(body?.data ?? [])];
    const hasil: BatchItemResult[] = items.map((_, indeks) => {
      const pesan = ditolak.get(indeks);
      if (pesan !== undefined) return { ok: false, error: pesan.slice(0, 300), permanent: true };
      const berikut = diterima.shift();
      return berikut?.id ? { ok: true, id: berikut.id } : { ok: false, error: "Penyedia email membalas tanpa id kiriman.", permanent: false };
    });
    return { kind: "ok", items: hasil };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return {
      kind: "failed",
      error: name === "TimeoutError" ? "Penyedia email tidak membalas dalam 20 detik." : error instanceof Error ? error.message.slice(0, 300) : "Gagal menghubungi penyedia email.",
      retryable: true,
      status: null,
    };
  }
}
