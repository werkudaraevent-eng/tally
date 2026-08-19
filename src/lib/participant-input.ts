import { z } from "zod";

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
});

export type ParticipantBody = z.infer<typeof participantBodySchema>;

export function toRpcArgs(body: ParticipantBody) {
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
  };
}
