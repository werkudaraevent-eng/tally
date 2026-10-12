import { z } from "zod";
import type { RegistrationField } from "@/lib/domain";
import { FILE_FIELD_TYPES } from "@/lib/registration-fields";
import { bacaSaringan, cocokSemua, hariDiZona, hitungNilai, kolomSaringanAdmin, type Saringan } from "@/lib/saringan-kolom";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Penyaring daftar peserta admin, satu definisi untuk tabel, "Pilih semua yang
 * cocok", dan Export.
 *
 * Penyaring lama (cari, Source, RSVP, Check-in, Organisation) dikerjakan
 * `list_event_participants` di database. Saringan per kolom ("+ Filter", `f`)
 * dikerjakan di sini, di atas hasil RPC itu: jawaban form ada di `extra` dan
 * jenis kolomnya ditentukan form tiap acara, jadi menyaringnya di SQL menuntut
 * migrasi fungsi. Hanya dipakai bila ada saringan per kolom; tanpa itu jalurnya
 * persis seperti sebelumnya (satu halaman langsung dari database).
 */

export const SORTABLE = [
  "name", "company", "title", "qr_code", "participant_type", "rsvp_status", "source_checked_in", "source_total_scans", "registered_at",
] as const;

export const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(SORTABLE).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  source: z.enum(["walkin", "scanner", "registration", "manual"]).optional(),
  session: z.coerce.number().int().positive().optional(),
  attended: z.enum(["yes", "no"]).optional(),
  rsvp: z.enum(["invited", "confirmed", "none"]).optional(),
  /** "Pilih semua yang cocok": hanya id seluruh baris yang lolos saringan. */
  ids_only: z.enum(["1"]).optional(),
  /** Saringan per kolom, JSON. Lihat `bacaSaringan`. */
  f: z.string().max(8000).optional(),
  /** Nilai yang ada di satu kolom, untuk daftar centang "+ Filter". */
  facet: z.string().max(200).optional(),
});

export type QueryPeserta = z.infer<typeof querySchema>;

/** Baris RPC yang dibaca saringan. */
export type BarisPeserta = {
  id: string;
  qr_code: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  registered_at?: string | null;
  extra: Record<string, unknown> | null;
};

/** Argumen RPC dari parameter URL. `companies` dikirim berulang karena nama bisa memuat koma. */
export function argumenRpc(eventId: string, data: QueryPeserta, companies: string[]) {
  return {
    p_event_id: eventId,
    p_q: data.q,
    p_source: data.source ?? null,
    // Penyaring kehadiran hanya berarti bila sesinya disebut. "Belum hadir"
    // tanpa menyebut di sesi mana adalah pertanyaan yang tidak punya jawaban
    // di acara yang punya registrasi, workshop, dan makan siang.
    p_session: data.attended ? (data.session ?? null) : null,
    p_attended: data.session ? (data.attended ?? null) : null,
    p_rsvp: data.rsvp ?? null,
    p_sort: data.sort,
    p_dir: data.dir,
    p_limit: data.limit,
    p_offset: data.offset,
    // Hanya dikirim bila dipakai: fungsi versi lama (sebelum migrasi
    // 202609290001) tidak mengenal parameter ini dan akan menolak panggilannya.
    ...(companies.length > 0 ? { p_companies: companies } : {}),
  };
}

/** Teks sel yang dibandingkan saringan: sama dengan yang tampil di tabel admin. "" = kosong. */
export function nilaiAdmin(fields: RegistrationField[], zona: string) {
  const perKunci = new Map(fields.map((field) => [field.key, field]));
  return (baris: BarisPeserta, kunci: string): string => {
    if (kunci === "registered_at") return baris.registered_at ? hariDiZona(baris.registered_at, zona) : "";
    if (kunci.startsWith("field:")) {
      const field = perKunci.get(kunci.slice(6));
      const v = baris.extra?.[kunci.slice(6)];
      if (!field) return "";
      if (field.type === "checkbox") return v === "true" || v === true ? "Yes" : "No";
      if (FILE_FIELD_TYPES.includes(field.type)) return v ? "File attached" : "";
      return v === null || v === undefined ? "" : String(v).trim();
    }
    const v = baris[kunci as "title" | "email" | "phone" | "participant_type" | "qr_code"];
    return typeof v === "string" ? v.trim() : "";
  };
}

/** Saringan per kolom yang sah untuk acara ini, atau null bila `f` rusak. */
export function saringanAdmin(f: string | undefined, fields: RegistrationField[]): Saringan[] | null {
  return bacaSaringan(f, kolomSaringanAdmin(fields));
}

/** Batas baca untuk saringan per kolom, jauh di atas acara terbesar sejauh ini. */
export const BATAS_BACA = 20000;

/** Dilempar bila acara melewati BATAS_BACA: lebih baik menolak daripada diam-diam memotong. */
export class TerlaluBanyak extends Error {
  constructor(public total: number) { super("TOO_MANY"); }
}

/**
 * Semua baris yang lolos penyaring RPC, berurutan seperti tabel. Untuk saringan
 * per kolom dan daftar nilai.
 *
 * SATU panggilan, bukan per halaman: urutan RPC (kolom, lalu nama) tidak unik,
 * jadi halaman-halaman offset bisa saling bertumpuk dan melewatkan baris (QA
 * #130 M1: 157 kembar dan 157 hilang di 21 ribu peserta). Hasil RPC adalah satu
 * nilai jsonb, jadi tidak terpotong batas 1000 baris PostgREST. Id kembar tetap
 * dibuang sebagai pengaman.
 */
export async function semuaBarisRpc<T extends BarisPeserta>(argumen: ReturnType<typeof argumenRpc>): Promise<T[]> {
  const { data, error } = await getSupabaseServiceClient().rpc("list_event_participants" as never, { ...argumen, p_limit: BATAS_BACA, p_offset: 0 } as never);
  if (error) throw new Error(error.message);
  const hasil = (data ?? { rows: [], total: 0 }) as { rows: T[]; total: number };
  if (hasil.total > BATAS_BACA) throw new TerlaluBanyak(hasil.total);
  const terlihat = new Set<string>();
  return hasil.rows.filter((baris) => (terlihat.has(baris.id) ? false : (terlihat.add(baris.id), true)));
}

export function saring<T extends BarisPeserta>(baris: T[], saringan: Saringan[], fields: RegistrationField[], zona: string): T[] {
  if (!saringan.length) return baris;
  const nilai = nilaiAdmin(fields, zona);
  return baris.filter((b) => cocokSemua(b, saringan, nilai));
}

/** Daftar nilai satu kolom beserta jumlahnya, dari semua peserta aktif acara. */
export async function nilaiKolomAdmin(eventId: string, kunci: string, fields: RegistrationField[], zona: string) {
  const baris = await semuaBarisRpc<BarisPeserta & { source_removed_at: string | null }>(
    argumenRpc(eventId, querySchema.parse({}), []),
  );
  return hitungNilai(baris.filter((b) => !b.source_removed_at), kunci, nilaiAdmin(fields, zona));
}

/**
 * Id peserta yang cocok dengan saringan di URL (sama dengan tabel), untuk
 * Export. `null` bila tidak ada saringan apa pun: ekspor seluruh acara.
 * Melempar "VALIDATION" bila parameternya tidak sah.
 */
export async function idsTersaring(eventId: string, params: URLSearchParams, fields: RegistrationField[], zona: string): Promise<string[] | null> {
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new Error("VALIDATION");
  const companies = params.getAll("company").map((nama) => nama.trim()).filter(Boolean).slice(0, 50);
  const saringan = saringanAdmin(parsed.data.f, fields);
  if (!saringan) throw new Error("VALIDATION");
  const d = parsed.data;
  const adaSaringan = Boolean(d.q || d.source || d.rsvp || (d.session && d.attended) || companies.length || saringan.length);
  if (!adaSaringan) return null;
  const baris = saring(await semuaBarisRpc(argumenRpc(eventId, d, companies)), saringan, fields, zona);
  return baris.map((b) => b.id);
}
