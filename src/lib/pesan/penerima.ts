import { z } from "zod";
import type { EventRow } from "@/lib/domain";
import { memberConfig } from "@/lib/member/account";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { allowedByList, messagingAllowlist, normalizeAddress } from "./alamat";
import type { BlastKind } from "./isi";

/**
 * Siapa yang menerima sebuah kiriman, dan siapa yang dilewati beserta alasannya.
 *
 * Satu fungsi untuk dua pemakai: hitungan di penyusun dan dialog konfirmasi
 * (tanpa menulis apa pun), dan pengantrean saat Kirim ditekan. Keduanya harus
 * sama persis; angka "228 peserta" di dialog adalah janji tentang baris yang
 * akan diantre.
 */

export const audienceSchema = z.object({
  jenis: z.enum(["semua", "belum_masuk", "manual"]).default("semua"),
  /** Penyempit: hanya perusahaan ini. Kosong = semua perusahaan. */
  perusahaan: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  /** Untuk `manual`: id peserta yang dipilih (Daftar peserta, Logistik). */
  ids: z.array(z.string().uuid()).max(5000).default([]),
  /** Nama pilihan manual untuk ditampilkan, mis. "Berubah sejak terbit". */
  label: z.string().trim().max(80).optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export type SkipCode = "tanpa_email" | "berhenti_email" | "email_memantul" | "area_mati" | "belum_boleh_masuk" | "di_luar_daftar_uji";

export const SKIP_REASON: Record<SkipCode, string> = {
  tanpa_email: "Tidak punya email",
  berhenti_email: "Berhenti menerima email",
  email_memantul: "Email pernah memantul",
  area_mati: "Area peserta belum dinyalakan",
  belum_boleh_masuk: "Belum boleh masuk area peserta",
  di_luar_daftar_uji: "Di luar daftar uji",
};

export type ParticipantRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  email_opt_out_at: string | null;
  email_invalid_at: string | null;
};

export type ResolvedRecipient = {
  participant: ParticipantRow;
  email: string | null;
  /** Akun area peserta yang sudah ada, untuk sasaran tautan undangan. */
  accountId: string | null;
  skip: SkipCode | null;
};

export type AudienceCounts = {
  total: number;
  email: number;
  skipped: Partial<Record<SkipCode, number>>;
};

const KOLOM = "id,name,company,email,phone,email_opt_out_at,email_invalid_at";
const HALAMAN = 1000;

async function semuaPeserta(eventId: string): Promise<ParticipantRow[]> {
  const client = getSupabaseServiceClient();
  const hasil: ParticipantRow[] = [];
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await client
      .from("participants")
      .select(KOLOM)
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .order("name")
      .range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(error.message);
    hasil.push(...((data ?? []) as ParticipantRow[]));
    if ((data ?? []).length < HALAMAN) return hasil;
  }
}

async function akunPeserta(eventId: string) {
  const client = getSupabaseServiceClient();
  const peta = new Map<string, { id: string; last_login_at: string | null }>();
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await client
      .from("participant_accounts")
      .select("id,participant_id,last_login_at")
      .eq("event_id", eventId)
      .not("participant_id", "is", null)
      .range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { id: string; participant_id: string; last_login_at: string | null }[];
    for (const baris of rows) peta.set(baris.participant_id, { id: baris.id, last_login_at: baris.last_login_at });
    if (rows.length < HALAMAN) return peta;
  }
}

/** Peserta dengan pendaftaran disetujui, untuk "Siapa yang bisa masuk" = disetujui. */
async function pesertaDisetujui(eventId: string) {
  const client = getSupabaseServiceClient();
  const set = new Set<string>();
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await client
      .from("event_registrations")
      .select("participant_id")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .not("participant_id", "is", null)
      .range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { participant_id: string }[];
    for (const baris of rows) set.add(baris.participant_id);
    if (rows.length < HALAMAN) return set;
  }
}

export async function resolveAudience(
  event: Pick<EventRow, "id" | "landing_config">,
  kind: BlastKind,
  audience: Audience,
): Promise<ResolvedRecipient[]> {
  const [peserta, akun] = await Promise.all([semuaPeserta(event.id), akunPeserta(event.id)]);
  const member = memberConfig(event);
  const disetujui = kind === "undangan" && member && (member.audience ?? "approved") === "approved" ? await pesertaDisetujui(event.id) : null;
  const perusahaan = new Set(audience.perusahaan.map((nama) => nama.toLowerCase()));
  const dipilih = audience.jenis === "manual" ? new Set(audience.ids) : null;
  const daftarUji = messagingAllowlist();

  return peserta
    .filter((p) => (dipilih ? dipilih.has(p.id) : true))
    .filter((p) => (audience.jenis === "belum_masuk" ? !akun.get(p.id)?.last_login_at : true))
    .filter((p) => (perusahaan.size ? perusahaan.has((p.company ?? "").trim().toLowerCase()) : true))
    .map((p) => {
      const email = normalizeAddress(p.email);
      let skip: SkipCode | null = null;
      if (!email) skip = "tanpa_email";
      else if (p.email_opt_out_at) skip = "berhenti_email";
      else if (p.email_invalid_at) skip = "email_memantul";
      else if (kind === "undangan" && !member) skip = "area_mati";
      else if (disetujui && !disetujui.has(p.id)) skip = "belum_boleh_masuk";
      else if (!allowedByList(email, daftarUji)) skip = "di_luar_daftar_uji";
      return { participant: p, email, accountId: akun.get(p.id)?.id ?? null, skip };
    });
}

export function countAudience(rows: ResolvedRecipient[]): AudienceCounts {
  const skipped: Partial<Record<SkipCode, number>> = {};
  for (const baris of rows) if (baris.skip) skipped[baris.skip] = (skipped[baris.skip] ?? 0) + 1;
  return { total: rows.length, email: rows.filter((baris) => !baris.skip).length, skipped };
}

/** Daftar perusahaan untuk penyaring penerima, terbanyak dulu. */
export async function companies(eventId: string) {
  const peserta = await semuaPeserta(eventId);
  const hitung = new Map<string, number>();
  for (const p of peserta) {
    const nama = p.company?.trim();
    if (nama) hitung.set(nama, (hitung.get(nama) ?? 0) + 1);
  }
  return [...hitung.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}
