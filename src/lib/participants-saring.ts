import { z } from "zod";
import type { RegistrationField } from "@/lib/domain";
import { FILE_FIELD_TYPES } from "@/lib/registration-fields";
import { logistikAcara, type LogistikRingkas } from "@/lib/logistik/server";
import { LABEL_ASAL, LABEL_RSVP, bacaSaringan, cocokSemua, hariDiZona, hitungNilai, kolomSaringanAdmin, labelKursi, urutKursi, urutMenurut, type Saringan, type SesiSaringan } from "@/lib/saringan-kolom";
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
 *
 * Urutan juga begitu: kolom yang dikenal `list_event_participants` diurutkan
 * database; kolom lain (Seat, check-in per sesi, Room, Bus, Source, Email,
 * Phone, Lucky draw, jawaban form) diurutkan di sini atas seluruh baris.
 */

/** Kolom yang diurutkan oleh RPC. Nama kolom TIDAK BOLEH diteruskan mentah ke SQL. */
const URUT_RPC = new Set(["name", "company", "title", "qr_code", "participant_type", "rsvp_status", "source_checked_in", "source_total_scans", "registered_at"]);
/** Kolom tetap yang diurutkan di sini; ditambah `checkin:<sesi>` dan `field:<kunci>`. */
const URUT_JS = new Set(["seat", "email", "phone", "source", "kamar", "bus", "undian"]);

/**
 * Siapa yang mengurutkan kolom `sort`: "rpc", "js", atau null bila kuncinya
 * tidak dikenal untuk acara ini (sesi atau pertanyaan yang tidak ada).
 */
export function pengurut(sort: string, fields: RegistrationField[], sesi: SesiSaringan[]): "rpc" | "js" | null {
  if (URUT_RPC.has(sort)) return "rpc";
  if (URUT_JS.has(sort)) return "js";
  if (sort.startsWith("checkin:")) return sesi.some((item) => `checkin:${item.id}` === sort) ? "js" : null;
  if (sort.startsWith("field:")) return fields.some((field) => `field:${field.key}` === sort) ? "js" : null;
  return null;
}

export const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Diperiksa `pengurut` terhadap kolom acara ini. */
  sort: z.string().trim().max(200).default("name"),
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
  company?: string | null;
  rsvp_status?: string | null;
  source?: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  registered_at?: string | null;
  extra: Record<string, unknown> | null;
  seats?: Array<{ label?: string | null }> | null;
  attendance?: Record<string, { count: number; first: string }> | null;
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
    // Kolom yang tidak dikenal RPC diurutkan di sini (urutPeserta). Urutan nama
    // dari RPC jadi pemecah seri.
    p_sort: URUT_RPC.has(data.sort) ? data.sort : "name",
    p_dir: URUT_RPC.has(data.sort) ? data.dir : "asc",
    p_limit: data.limit,
    p_offset: data.offset,
    // Hanya dikirim bila dipakai: fungsi versi lama (sebelum migrasi
    // 202609290001) tidak mengenal parameter ini dan akan menolak panggilannya.
    ...(companies.length > 0 ? { p_companies: companies } : {}),
  };
}

/** Data dari tabel lain yang dibaca hanya bila saringan atau urutan memakainya. */
export type KonteksNilai = {
  fields: RegistrationField[];
  zona: string;
  logistik?: Map<string, LogistikRingkas>;
  dikecualikan?: Set<string>;
};

/** Baca Logistik dan pengecualian undian bila salah satu kunci memakainya. */
export async function muatKonteks(eventId: string, kunci: string[], fields: RegistrationField[], zona: string): Promise<KonteksNilai> {
  const konteks: KonteksNilai = { fields, zona };
  const perlu = new Set(kunci);
  if (perlu.has("kamar") || perlu.has("bus")) konteks.logistik = await logistikAcara(eventId);
  if (perlu.has("undian")) {
    const client = getSupabaseServiceClient();
    const ids = new Set<string>();
    for (let dari = 0; dari < BATAS_BACA; dari += 1000) {
      const { data, error } = await client.from("undian_exclusions").select("participant_id").eq("event_id", eventId).order("participant_id").range(dari, dari + 999);
      if (error) throw new Error(error.message);
      for (const baris of (data ?? []) as Array<{ participant_id: string }>) ids.add(baris.participant_id);
      if (!data || data.length < 1000) break;
    }
    konteks.dikecualikan = ids;
  }
  return konteks;
}

/** Teks sel yang dibandingkan saringan: sama dengan yang tampil di tabel admin. "" = kosong. */
export function nilaiAdmin({ fields, zona, logistik, dikecualikan }: KonteksNilai) {
  const perKunci = new Map(fields.map((field) => [field.key, field]));
  return (baris: BarisPeserta, kunci: string): string => {
    if (kunci === "seat") return labelKursi(baris).join(", ");
    if (kunci === "registered_at") return baris.registered_at ? hariDiZona(baris.registered_at, zona) : "";
    if (kunci === "company") return baris.company?.trim() ?? "";
    if (kunci === "rsvp") return baris.rsvp_status ? LABEL_RSVP[baris.rsvp_status] ?? baris.rsvp_status : "";
    if (kunci === "source") return baris.source ? LABEL_ASAL[baris.source] ?? baris.source : "";
    if (kunci === "kamar") return logistik?.get(baris.id)?.kamar ?? "";
    if (kunci === "bus") return logistik?.get(baris.id)?.bus ?? "";
    if (kunci === "undian") return dikecualikan?.has(baris.id) ? "Excluded" : "Included";
    if (kunci.startsWith("checkin:")) return baris.attendance?.[kunci.slice(8)] ? "Checked in" : "Not checked in";
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

/**
 * Urutkan seluruh baris menurut kolom yang tidak dikenal RPC. Seat menurut
 * kursi pertama, check-in menurut jam scan pertama di sesi itu (yang belum
 * check-in di akhir), lainnya menurut teks yang tampil dengan urutan alami.
 */
export function urutPeserta<T extends BarisPeserta>(baris: T[], sort: string, dir: "asc" | "desc", konteks: KonteksNilai): T[] {
  if (sort === "seat") return urutKursi(baris, dir);
  if (sort.startsWith("checkin:")) return urutMenurut(baris, (b) => b.attendance?.[sort.slice(8)]?.first ?? "", dir);
  const nilai = nilaiAdmin(konteks);
  // Kotak centang yang tidak dicentang tampil kosong di tabel, jadi ikut di akhir.
  return urutMenurut(baris, (b) => { const v = nilai(b, sort); return v === "No" && sort.startsWith("field:") ? "" : v; }, dir);
}

/** Sesi kehadiran acara, untuk kolom check-in di "+ Filter" dan urutan. */
export async function sesiAcara(eventId: string): Promise<SesiSaringan[]> {
  const { data } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .select("id,name")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []) as SesiSaringan[];
}

/** Saringan per kolom yang sah untuk acara ini, atau null bila `f` rusak. */
export function saringanAdmin(f: string | undefined, fields: RegistrationField[], sesi: SesiSaringan[]): Saringan[] | null {
  return bacaSaringan(f, kolomSaringanAdmin(fields, sesi));
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

export function saring<T extends BarisPeserta>(baris: T[], saringan: Saringan[], konteks: KonteksNilai): T[] {
  if (!saringan.length) return baris;
  const nilai = nilaiAdmin(konteks);
  return baris.filter((b) => cocokSemua(b, saringan, nilai));
}

/** Daftar nilai satu kolom beserta jumlahnya, dari semua peserta aktif acara. */
export async function nilaiKolomAdmin(eventId: string, kunci: string, fields: RegistrationField[], zona: string) {
  const [baris, konteks] = await Promise.all([
    semuaBarisRpc<BarisPeserta & { source_removed_at: string | null }>(argumenRpc(eventId, querySchema.parse({}), [])),
    muatKonteks(eventId, [kunci], fields, zona),
  ]);
  return hitungNilai(baris.filter((b) => !b.source_removed_at), kunci, nilaiAdmin(konteks));
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
  const saringan = saringanAdmin(parsed.data.f, fields, await sesiAcara(eventId));
  if (!saringan) throw new Error("VALIDATION");
  const d = parsed.data;
  const adaSaringan = Boolean(d.q || d.source || d.rsvp || (d.session && d.attended) || companies.length || saringan.length);
  if (!adaSaringan) return null;
  const [semua, konteks] = await Promise.all([
    semuaBarisRpc(argumenRpc(eventId, d, companies)),
    muatKonteks(eventId, saringan.map((s) => s.k), fields, zona),
  ]);
  return saring(semua, saringan, konteks).map((b) => b.id);
}
