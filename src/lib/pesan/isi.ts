import type { EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { formatEventDate } from "@/lib/event-datetime";
import { escapeHtml } from "@/lib/email/registration-code";

/**
 * Isi email Pesan peserta: templat bawaan, kolom isian, dan penyusun HTML.
 *
 * Kolom isian ditulis panitia sebagai `{nama}`, `{perusahaan}`, `{acara}`,
 * `{tanggal}`. Tautan masuk tidak ditulis di teks: undangan selalu membawa satu
 * tombol "Masuk ke acara", dan kabar biasa membawa tombol ke halaman acara.
 * Dengan begitu panitia tidak bisa lupa menyertakan tautan, atau menempelkan
 * tautan orang lain.
 */

import { DEFAULT_CONTENT, FIELDS, INVITATION_REMINDER, type BlastKind, type FieldKey } from "./bawaan";

export { DEFAULT_CONTENT, FIELDS, INVITATION_REMINDER };
export type { BlastKind, FieldKey };

export type Recipient = { name: string; company: string | null };

export function fieldValues(event: Pick<EventRow, "name" | "landing_config" | "event_date" | "end_date" | "start_time" | "end_time" | "time_zone">, recipient: Recipient): Record<FieldKey, string> {
  return {
    nama: recipient.name.trim() || "Peserta",
    perusahaan: recipient.company?.trim() || "",
    acara: publicEventName(event),
    tanggal: formatEventDate(event as Parameters<typeof formatEventDate>[0]) ?? "",
  };
}

/** Ganti `{kolom}` dengan nilainya. Kolom yang tidak dikenal dibiarkan apa adanya supaya terlihat di pratinjau. */
export function fillFields(template: string, values: Record<FieldKey, string>) {
  return template.replace(/\{(nama|perusahaan|acara|tanggal)\}/g, (_, key: FieldKey) => values[key]);
}

/** Kolom yang ditulis panitia tetapi tidak dikenal, untuk peringatan di penyusun. */
export function unknownFields(template: string): string[] {
  const dikenal = new Set<string>(FIELDS.map((field) => field.key));
  return [...new Set([...template.matchAll(/\{([^{}\s]{1,30})\}/g)].map((cocok) => cocok[1]).filter((key) => !dikenal.has(key)))];
}

/** Tautan contoh di pratinjau dan email tes: tidak bisa dipakai masuk atau mendaftar. */
export function contohTautan(origin: string, slug: string, kind: BlastKind) {
  const dasar = `${origin}/e/${encodeURIComponent(slug)}`;
  if (kind === "undangan") return `${dasar}/masuk?sandi=contoh-tidak-berlaku`;
  if (kind === "invitation") return `${dasar}/daftar?undangan=contoh-tidak-berlaku`;
  return dasar;
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderEmail(input: {
  kind: BlastKind;
  subject: string;
  body: string;
  eventName: string;
  values: Record<FieldKey, string>;
  /** Tombol utama: tautan masuk (undangan) atau halaman acara (info). */
  actionUrl: string;
  /** Tautan berhenti berlangganan untuk kaki email. Null di email tes. */
  unsubscribeUrl: string | null;
  test?: boolean;
  /** Satu kalimat dari sistem tepat di atas tombol, mis. untuk peserta yang sudah punya akun. */
  note?: string | null;
}): RenderedEmail {
  const subjek = `${input.test ? "[TES] " : ""}${fillFields(input.subject, input.values).trim() || input.eventName}`;
  const isi = fillFields(input.body, input.values).trim();
  const tombol = input.kind === "undangan" ? "Masuk ke acara" : input.kind === "invitation" ? "Daftar sekarang" : "Buka halaman acara";
  // Tamu undangan belum peserta: kaki email menyebut alasan yang benar.
  const alasan =
    input.kind === "invitation"
      ? `Anda menerima email ini karena panitia ${input.eventName} mengundang Anda.`
      : `Anda menerima email ini karena terdaftar sebagai peserta ${input.eventName}.`;
  const paragraf = isi
    .split(/\n{2,}/)
    .map((bagian) => bagian.trim())
    .filter(Boolean)
    .map((bagian) => `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(bagian).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const catatanUji = input.test
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#FDF5E1;color:#8A5A00;font-size:13px;line-height:1.5;border-radius:6px;">Email tes. Tautan di bawah contoh dan tidak bisa dipakai.</p>`
    : "";
  const kaki = input.unsubscribeUrl
    ? `${escapeHtml(alasan)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#66736C;">Berhenti menerima email untuk acara ini</a>.`
    : escapeHtml(alasan);

  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    ${catatanUji}
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">${escapeHtml(input.eventName)}</p>
    ${paragraf}
    ${input.note ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(input.note)}</p>` : ""}
    <p style="margin:28px 0 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:14px 28px;background:#2649D0;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${tombol}</a></p>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#66736C;">Tombol tidak bisa diklik? Salin alamat ini ke peramban:<br><span style="word-break:break-all;">${escapeHtml(input.actionUrl)}</span></p>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">${kaki}</p>
  </div>
</body></html>`;

  const text = [
    ...(input.test ? ["[EMAIL TES: tautan di bawah contoh dan tidak bisa dipakai masuk]", ""] : []),
    input.eventName,
    "",
    isi,
    ...(input.note ? ["", input.note] : []),
    "",
    `${tombol}: ${input.actionUrl}`,
    "",
    alasan,
    ...(input.unsubscribeUrl ? [`Berhenti menerima email untuk acara ini: ${input.unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject: subjek, html, text };
}
