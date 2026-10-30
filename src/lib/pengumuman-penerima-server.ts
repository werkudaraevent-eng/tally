import { z } from "zod";
import type { EventRow } from "@/lib/domain";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { jawabanPeserta, kolomSasaran, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { muatStayPeserta, periksaSyarat, type StayPeserta } from "@/lib/sasaran-baris-server";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import {
  bacaSyaratPengumuman,
  KOLOM_ORGANISASI,
  ORGANISASI_MAX,
  ORGANISASI_PANJANG,
  PILIH_MAX,
  SYARAT_PENGUMUMAN_MAX,
  syaratCocok,
  type AudiensPengumuman,
} from "@/lib/sasaran-pengumuman";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

// Penerima pengumuman di sisi admin: pemeriksaan kiriman Send to, hitungan
// peserta yang cocok, dan penerima salinan email. Aturan cocoknya sama dengan
// portal (sasaran-pengumuman.ts), supaya angka "Matches N" adalah janji tentang
// siapa yang melihatnya.

export const penerimaSchema = z.object({
  audience: z.enum(["semua", "disetujui", "syarat", "pilih"]),
  audience_rules: z
    .array(
      z.object({
        field: z.string().regex(/^([a-z0-9_]{1,64}|@hotel|@company)$/),
        values: z.array(z.string().trim().min(1).max(ORGANISASI_PANJANG)).min(1).max(ORGANISASI_MAX),
      }),
    )
    .min(1)
    .max(SYARAT_PENGUMUMAN_MAX)
    .nullable()
    .optional(),
  audience_ids: z.array(z.string().uuid()).min(1).max(PILIH_MAX).nullable().optional(),
});

export type Penerima = { audience: AudiensPengumuman; audience_rules: Array<{ field: string; values: string[] }> | null; audience_ids: string[] | null };

type AcaraPenerima = Pick<EventRow, "id" | "registration_form_config" | "landing_config"> & { time_zone?: unknown };

/** Kolom penerima dari migrasi 202610300004 sudah ada? */
export async function penerimaSiap(): Promise<boolean> {
  const { error } = await getSupabaseServiceClient().from("event_announcements").select("audience_rules,audience_ids").limit(0);
  return !error;
}

/** Id dalam potongan kecil supaya URL PostgREST `in.(...)` tetap pendek. */
function potong<T>(isi: T[], ukuran = 100): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < isi.length; i += ukuran) hasil.push(isi.slice(i, i + ukuran));
  return hasil;
}

/**
 * Send to yang sah untuk acara ini. Syarat kolom dan Hotel diperiksa sama
 * dengan Who sees it Agenda; Organisasi cukup nama yang tidak kosong. Akun
 * peran kustom tidak memakai Hotel (logistik tertutup bagi mereka). Peserta
 * terpilih harus milik acara ini. `galat` null = galat server.
 */
export async function periksaPenerima(
  masuk: z.infer<typeof penerimaSchema>,
  event: AcaraPenerima,
  kustom: boolean,
): Promise<{ penerima: Penerima } | { galat: string | null }> {
  const { audience } = masuk;
  if (audience === "semua" || audience === "disetujui") return { penerima: { audience, audience_rules: null, audience_ids: null } };

  if (audience === "pilih") {
    const ids = [...new Set(masuk.audience_ids ?? [])];
    if (ids.length === 0) return { galat: "Choose at least one participant." };
    const ada = new Set<string>();
    for (const bagian of potong(ids)) {
      const { data, error } = await getSupabaseServiceClient().from("participants").select("id").eq("event_id", event.id).in("id", bagian);
      if (error) return { galat: null };
      for (const baris of (data ?? []) as Array<{ id: string }>) ada.add(baris.id);
    }
    if (ada.size !== ids.length) return { galat: "Some chosen participants are no longer in this event. Reload the page." };
    return { penerima: { audience, audience_rules: null, audience_ids: ids } };
  }

  const syarat = masuk.audience_rules ?? [];
  if (syarat.length === 0) return { galat: "Add at least one condition." };
  if (new Set(syarat.map((isi) => isi.field)).size !== syarat.length) return { galat: "Each field can be used in one condition only." };
  if (kustom && syarat.some((isi) => isi.field === KOLOM_HOTEL)) return { galat: "Hotel conditions need a full admin account." };
  const kolom = syarat.filter((isi) => isi.field !== KOLOM_ORGANISASI);
  if (kolom.length) {
    if (kolom.some((isi) => isi.values.length > SASARAN_NILAI_MAX || isi.values.some((nilai) => nilai.length > SASARAN_NILAI_PANJANG))) {
      return { galat: "That answer is no longer in the participant field. Reload the page." };
    }
    const sah = await periksaSyarat(kolom, event);
    if ("galat" in sah) return sah;
  }
  return { penerima: { audience, audience_rules: bacaSyaratPengumuman(syarat), audience_ids: null } };
}

type BarisPeserta = { id: string; name: string; company: string | null; extra: Record<string, unknown> | null };

/**
 * Peserta aktif (tidak dihapus dari sumber sync) yang melihat pengumuman ini,
 * dari seluruh peserta acara. Null bila gagal dibaca. Untuk semua dan
 * disetujui: semua peserta aktif.
 */
export async function pesertaCocok(event: AcaraPenerima, penerima: Penerima): Promise<{ cocok: BarisPeserta[]; total: number } | null> {
  const db = getSupabaseServiceClient();
  const peserta = await semuaBaris<BarisPeserta>(() =>
    db.from("participants").select("id,name,company,extra").eq("event_id", event.id).is("source_removed_at", null).order("id"));
  if (!peserta) return null;
  if (penerima.audience === "semua" || penerima.audience === "disetujui") return { cocok: peserta, total: peserta.length };
  if (penerima.audience === "pilih") {
    const ids = new Set(penerima.audience_ids ?? []);
    return { cocok: peserta.filter((orang) => ids.has(orang.id)), total: peserta.length };
  }

  const syarat = bacaSyaratPengumuman(penerima.audience_rules);
  let stays: StayPeserta = new Map();
  // Hotel hanya dihitung bila kamar ditampilkan ke peserta, seperti di portal.
  if (bagianTampil(memberConfig(event), "rooms") && syarat.some((isi) => isi.field === KOLOM_HOTEL)) {
    const dimuat = await muatStayPeserta(event.id);
    if (!dimuat) return null;
    stays = dimuat;
  }
  const offset = timeZoneOffset(normalizeTimeZone(event.time_zone));
  const kolom = kolomSasaran(event.registration_form_config);
  const kunci = syarat.map((isi) => isi.field).filter((field) => field && field !== KOLOM_HOTEL && field !== KOLOM_ORGANISASI);
  const cocok = peserta.filter((orang) => {
    const jawaban = Object.fromEntries(kunci.map((key) => [key, jawabanPeserta(orang.extra, key)]));
    return syaratCocok(syarat, orang.company, { jawaban, stays: stays.get(orang.id) ?? [], offset, kolom });
  });
  return { cocok, total: peserta.length };
}

export type AkunPenerima = { participant_id: string | null; email: string | null };

/**
 * Akun area peserta yang melihat pengumuman ini sekarang: semua akun, akun
 * yang tertaut, atau akun yang tertaut ke peserta yang cocok. Peserta yang
 * cocok tapi belum punya akun melihatnya saat pertama masuk.
 */
export async function akunPenerima(event: AcaraPenerima, penerima: Penerima): Promise<AkunPenerima[] | null> {
  const db = getSupabaseServiceClient();
  const akun = await semuaBaris<AkunPenerima>(() => {
    const kueri = db.from("participant_accounts").select("id,participant_id,email").eq("event_id", event.id);
    return (penerima.audience === "semua" ? kueri : kueri.not("participant_id", "is", null)).order("id");
  });
  if (!akun) return null;
  if (penerima.audience === "semua" || penerima.audience === "disetujui") return akun;
  const hasil = await pesertaCocok(event, penerima);
  if (!hasil) return null;
  const ids = new Set(hasil.cocok.map((orang) => orang.id));
  return akun.filter((baris) => baris.participant_id !== null && ids.has(baris.participant_id));
}
