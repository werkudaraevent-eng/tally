import { z } from "zod";
import type { EventRow } from "@/lib/domain";
import { memberConfig } from "@/lib/member/account";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { allowedByList, messagingAllowlist, normalizeAddress } from "./alamat";
import type { BlastKind } from "./isi";
import { allInvitations, sendStates } from "@/lib/undangan/data";
import { emailHash, inviteSecretReady } from "@/lib/undangan/tanda";

/**
 * Siapa yang menerima sebuah kiriman, dan siapa yang dilewati beserta alasannya.
 *
 * Satu fungsi untuk dua pemakai: hitungan di penyusun dan dialog konfirmasi
 * (tanpa menulis apa pun), dan pengantrean saat Kirim ditekan. Keduanya harus
 * sama persis; angka "228 peserta" di dialog adalah janji tentang baris yang
 * akan diantre.
 */

export const audienceSchema = z.object({
  /**
   * Peserta: semua | belum_masuk | manual.
   * Tamu undangan (jenis kiriman `invitation`): belum_dikirim | belum_daftar |
   * manual, dengan `ids` berisi id undangan.
   */
  jenis: z.enum(["semua", "belum_masuk", "manual", "belum_dikirim", "belum_daftar"]).default("semua"),
  /** Penyempit: hanya perusahaan ini. Kosong = semua perusahaan. */
  perusahaan: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  /** Untuk `manual`: id peserta yang dipilih (Daftar peserta, Logistik). */
  ids: z.array(z.string().uuid()).max(5000).default([]),
  /** Nama pilihan manual untuk ditampilkan, mis. "Berubah sejak terbit". */
  label: z.string().trim().max(80).optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export type SkipCode =
  | "tanpa_email"
  | "berhenti_email"
  | "email_memantul"
  | "area_mati"
  | "belum_boleh_masuk"
  | "di_luar_daftar_uji"
  | "sudah_daftar"
  | "sudah_peserta"
  | "terjadwal";

export const SKIP_REASON: Record<SkipCode, string> = {
  tanpa_email: "Tidak punya email",
  berhenti_email: "Berhenti menerima email",
  email_memantul: "Email pernah memantul",
  area_mati: "Area peserta belum dinyalakan",
  belum_boleh_masuk: "Belum boleh masuk area peserta",
  di_luar_daftar_uji: "Di luar daftar uji",
  sudah_daftar: "Sudah mendaftar",
  sudah_peserta: "Email ini sudah dipakai peserta",
  terjadwal: "Sudah ada di kiriman lain yang belum selesai",
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
  /**
   * Untuk kiriman `invitation` baris ini TAMU UNDANGAN, bukan peserta: `id`
   * adalah id undangan dan barisnya diantre dengan `invitation_id`.
   */
  target: "participant" | "invitation";
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
  if (kind === "invitation") return resolveInvitees(event, audience);
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
      return { target: "participant" as const, participant: p, email, accountId: akun.get(p.id)?.id ?? null, skip };
    });
}

/**
 * Tamu undangan sebagai penerima Invitation. Dilewati beserta alasannya:
 * sudah mendaftar, berhenti atau memantul (termasuk penekanan per acara),
 * emailnya sudah dipakai peserta aktif, atau sudah ada di kiriman Invitation
 * lain yang belum selesai (Terjadwal).
 */
async function resolveInvitees(event: Pick<EventRow, "id">, audience: Audience): Promise<ResolvedRecipient[]> {
  const [undangan, keadaan, emailPeserta, tekan] = await Promise.all([
    allInvitations(event.id),
    sendStates(event.id),
    emailPesertaAktif(event.id),
    penekanan(event.id),
  ]);
  const dipilih = audience.jenis === "manual" ? new Set(audience.ids) : null;
  const daftarUji = messagingAllowlist();
  return undangan
    .filter((u) => !u.rejected_at)
    .filter((u) => (dipilih ? dipilih.has(u.id) : true))
    .filter((u) => (audience.jenis === "belum_dikirim" ? !keadaan.get(u.id)?.sent : true))
    // Pengingat hanya untuk yang sudah pernah dikirimi undangan.
    .filter((u) => (audience.jenis === "belum_daftar" ? Boolean(keadaan.get(u.id)?.sent) : true))
    .map((u) => {
      const email = normalizeAddress(u.email);
      // Tanpa rahasia tautan tidak ada hash; kiriman Invitation memang terkunci.
      const ditekan = email && inviteSecretReady() ? tekan.get(emailHash(email)) : undefined;
      let skip: SkipCode | null = null;
      if (u.registered_at) skip = "sudah_daftar";
      else if (!email) skip = "tanpa_email";
      else if (u.opted_out_at || ditekan === "berhenti" || ditekan === "spam") skip = "berhenti_email";
      else if (u.email_invalid_at || ditekan === "memantul") skip = "email_memantul";
      else if (emailPeserta.has(email)) skip = "sudah_peserta";
      else if (keadaan.get(u.id)?.queued) skip = "terjadwal";
      else if (!allowedByList(email, daftarUji)) skip = "di_luar_daftar_uji";
      return {
        target: "invitation" as const,
        participant: { id: u.id, name: u.name, company: u.company, email: u.email, phone: u.phone, email_opt_out_at: u.opted_out_at, email_invalid_at: u.email_invalid_at },
        email,
        accountId: null,
        skip,
      };
    })
    // Yang sudah mendaftar tidak dihitung sebagai penerima yang dilewati: di
    // saringan "Belum daftar" mereka memang bukan sasaran.
    .filter((r) => !(audience.jenis !== "manual" && r.skip === "sudah_daftar"));
}

/** Email peserta aktif acara ini, untuk melewati tamu yang sudah jadi peserta lewat jalur lain. */
async function emailPesertaAktif(eventId: string): Promise<Set<string>> {
  const set = new Set<string>();
  for (const p of await semuaPeserta(eventId)) {
    const email = normalizeAddress(p.email);
    if (email) set.add(email);
  }
  return set;
}

async function penekanan(eventId: string): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event_email_suppressions")
    .select("email_hash,reason")
    .eq("event_id", eventId)
    .limit(10000);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { email_hash: string; reason: string }[]).map((r) => [r.email_hash, r.reason]));
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
