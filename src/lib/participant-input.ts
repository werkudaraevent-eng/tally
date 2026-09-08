import { z } from "zod";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { FILE_FIELD_TYPES, MAX_ANSWER_LENGTH, MAX_CUSTOM_FIELDS, validateAnswers, type FieldIssue } from "@/lib/registration-fields";

// Bentuk badan permintaan untuk tambah dan sunting peserta.
//
// Ditaruh di lib dan bukan diekspor dari route.ts karena berkas route App
// Router hanya boleh mengekspor handler HTTP dan beberapa nilai konfigurasi;
// ekspor lain ditolak saat build. Dua route memakainya (POST daftar dan PATCH
// per-id), dan menyalinnya berarti suatu saat hanya satu yang diperbarui.

/**
 * Semua kolom opsional dinormalkan ke `null`, bukan dibiarkan `undefined`:
 * `save_participant` menulis SELURUH kolom pada tiap penyimpanan, jadi field
 * yang hilang dari payload harus berarti "kosongkan", bukan "biarkan" -- kalau
 * tidak, mengosongkan jabatan lewat UI menjadi mustahil.
 *
 * `extra` adalah pengecualian yang disengaja: bila tidak dikirim, RPC
 * membiarkan jawaban yang sudah ada. Pemanggil lama yang tidak mengenal kolom
 * ini tidak boleh menghapus jawaban pendaftar hanya karena tidak mengirimnya.
 */
export const participantBodySchema = z.object({
  qr_code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(300).nullish(),
  title: z.string().trim().max(300).nullish(),
  // `.or(z.literal(""))` karena input kosong di form mengirim string kosong,
  // dan validator email menolaknya sebelum sempat diterjemahkan jadi null.
  email: z.string().trim().max(320).email().nullish().or(z.literal("")),
  phone: z.string().trim().max(50).nullish(),
  participant_type: z.string().trim().max(50).nullish(),
  rsvp_status: z.enum(["invited", "confirmed"]).nullish().or(z.literal("")),
  extra: z
    .record(z.string().max(MAX_ANSWER_LENGTH))
    .refine((value) => Object.keys(value).length <= MAX_CUSTOM_FIELDS)
    .optional(),
});

export type ParticipantBody = z.infer<typeof participantBodySchema>;

/**
 * Field yang jawabannya bisa DIKETIK panitia. Berkas unggahan tidak termasuk:
 * nilainya id baris `registration_uploads` yang hanya bisa dibuat pendaftar
 * lewat halaman publik, dan panitia tidak punya jalur mengunggah atas nama
 * orang lain.
 */
export function editableFields(config: RegistrationFormConfig | null | undefined): RegistrationField[] {
  return ((config?.fields ?? []) as RegistrationField[]).filter((field) => !FILE_FIELD_TYPES.includes(field.type));
}

/**
 * Bersihkan jawaban tambahan dari panitia terhadap konfigurasi form acara.
 *
 * Kunci yang tidak dikenal dibuang, pilihan yang tidak ada di daftar ditolak,
 * field wajib boleh kosong (lihat `enforceRequired`). Jawaban berkas yang sudah
 * tersimpan DIPERTAHANKAN apa adanya: panitia tidak bisa mengetiknya, jadi
 * penyuntingan tidak boleh menghapusnya.
 */
export function cleanExtra(
  config: RegistrationFormConfig | null | undefined,
  extra: Record<string, string> | undefined,
  existing: Record<string, string> = {},
): { issues: FieldIssue[]; clean: Record<string, string> | null } {
  if (extra === undefined) return { issues: [], clean: null };
  const fields = editableFields(config);
  const { issues, clean } = validateAnswers(fields, extra, { enforceRequired: false });
  const berkas = ((config?.fields ?? []) as RegistrationField[]).filter((field) => FILE_FIELD_TYPES.includes(field.type));
  for (const field of berkas) {
    if (existing[field.key]) clean[field.key] = existing[field.key];
  }
  return { issues, clean };
}

export function toRpcArgs(body: ParticipantBody, extra: Record<string, string> | null) {
  const blank = (value: string | null | undefined) => (value == null || value === "" ? null : value);
  return {
    p_qr_code: body.qr_code,
    p_name: body.name,
    p_company: blank(body.company),
    p_title: blank(body.title),
    p_email: blank(body.email),
    p_phone: blank(body.phone),
    p_participant_type: blank(body.participant_type),
    p_rsvp_status: blank(body.rsvp_status),
    p_extra: extra,
  };
}
