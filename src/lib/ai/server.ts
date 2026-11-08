import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { bukaSandi } from "@/lib/ai/kunci";
import { awalBulan, biayaUsd, fiturAi, MODEL_BAWAAN, modelUntuk, type SetelanAi } from "@/lib/ai/model";

/**
 * Potongan server AI: setelan dari `ai_settings`, pemakaian dari `ai_runs`,
 * dan klien Anthropic dengan kunci yang dibuka dari sandinya.
 *
 * Semua dibaca service role. Tabelnya tertutup untuk anon dan authenticated
 * (migrasi 202611080070), jadi gerbangnya route: /api/admin/ai hanya super
 * admin, route fitur hanya admin acara itu.
 */

type BarisSetelan = {
  api_key_cipher: string | null;
  api_key_last4: string | null;
  default_model: string;
  feature_models: Record<string, string> | null;
  features_off: string[] | null;
  monthly_limit_usd: number | string;
  key_checked_at: string | null;
};

const db = () => getSupabaseServiceClient();

/** `belum` = tabelnya belum ada (migrasi belum dijalankan). */
export async function bacaSetelanMentah(): Promise<BarisSetelan | null | "belum"> {
  const { data, error } = await db().from("ai_settings").select("api_key_cipher,api_key_last4,default_model,feature_models,features_off,monthly_limit_usd,key_checked_at").eq("id", true).maybeSingle();
  if (error) return ["PGRST205", "42P01"].includes(String(error.code ?? "")) ? "belum" : null;
  return (data as BarisSetelan | null) ?? {
    api_key_cipher: null, api_key_last4: null, default_model: MODEL_BAWAAN, feature_models: {}, features_off: [], monthly_limit_usd: 20, key_checked_at: null,
  };
}

export function rapikanSetelan(baris: BarisSetelan): SetelanAi {
  return {
    adaKunci: Boolean(baris.api_key_cipher),
    kunciAkhir: baris.api_key_last4,
    modelBawaan: baris.default_model || MODEL_BAWAAN,
    modelFitur: baris.feature_models ?? {},
    fiturMati: baris.features_off ?? [],
    batasBulanan: Number(baris.monthly_limit_usd) || 0,
    kunciDicek: baris.key_checked_at,
  };
}

/** Jumlah biaya bulan berjalan (UTC), untuk batas bulanan. Null bila gagal dibaca. */
export async function biayaBulanIni(): Promise<number | null> {
  const mulai = awalBulan(new Date()).toISOString();
  let total = 0;
  // Dibaca per 1000 (batas baca PostgREST), keyset di id.
  for (let terakhir = 0; ;) {
    const { data, error } = await db().from("ai_runs").select("id,cost_usd").gte("created_at", mulai).gt("id", terakhir).order("id").limit(1000);
    if (error || !Array.isArray(data)) return null;
    for (const r of data as Array<{ id: number; cost_usd: number | string }>) total += Number(r.cost_usd) || 0;
    if (data.length < 1000) break;
    terakhir = (data[data.length - 1] as { id: number }).id;
  }
  return total;
}

export type KesiapanFitur =
  | { siap: true; klien: Anthropic; model: string }
  | { siap: false; alasan: "belum_migrasi" | "tanpa_kunci" | "fitur_mati" | "batas" | "galat"; pesan: string };

/**
 * Apakah satu fitur boleh dipakai sekarang: ada kunci, fiturnya menyala, dan
 * biaya bulan ini belum mencapai batas. Pesan ditulis untuk admin acara yang
 * menekan tombolnya; yang bisa mengubah setelan hanya pemilik.
 */
export async function siapkanFitur(fitur: string): Promise<KesiapanFitur> {
  const mentah = await bacaSetelanMentah();
  if (mentah === "belum") return { siap: false, alasan: "belum_migrasi", pesan: "AI needs a database update first. Ask the Tally owner." };
  if (!mentah) return { siap: false, alasan: "galat", pesan: "AI settings could not be read. Try again." };
  const setelan = rapikanSetelan(mentah);
  if (!fiturAi(fitur)?.siap || setelan.fiturMati.includes(fitur)) return { siap: false, alasan: "fitur_mati", pesan: "This AI feature is turned off. The Tally owner can turn it on in AI settings." };
  const kunci = mentah.api_key_cipher ? bukaSandi(mentah.api_key_cipher) : null;
  if (!kunci) return { siap: false, alasan: "tanpa_kunci", pesan: "AI is not set up yet. The Tally owner adds the API key in AI settings." };
  const terpakai = await biayaBulanIni();
  if (terpakai === null) return { siap: false, alasan: "galat", pesan: "AI usage could not be read. Try again." };
  if (setelan.batasBulanan <= 0 || terpakai >= setelan.batasBulanan) {
    return { siap: false, alasan: "batas", pesan: "AI limit reached this month. Ask the Tally owner to raise it in AI settings. The normal import still works." };
  }
  return { siap: true, klien: new Anthropic({ apiKey: kunci, maxRetries: 1 }), model: modelUntuk(setelan, fitur) };
}

export async function catatRun(run: {
  eventId: string | null;
  userId: string | null;
  fitur: string;
  model: string;
  berkas: string[];
  tokenMasuk: number;
  tokenKeluar: number;
  status: "preview" | "failed";
  detail?: Record<string, unknown>;
}): Promise<number | null> {
  const { data, error } = await db().from("ai_runs").insert({
    event_id: run.eventId,
    user_id: run.userId,
    feature: run.fitur,
    model: run.model,
    file_names: run.berkas.map((n) => n.slice(0, 200)).slice(0, 20),
    input_tokens: run.tokenMasuk,
    output_tokens: run.tokenKeluar,
    cost_usd: biayaUsd(run.model, run.tokenMasuk, run.tokenKeluar),
    status: run.status,
    detail: run.detail ?? {},
  } as never).select("id").single();
  if (error || !data) return null;
  return (data as { id: number }).id;
}

/** Hasil akhir satu pemakaian: disimpan atau ditutup. Hanya baris acara itu yang masih `preview`. */
export async function akhiriRun(id: number, eventId: string, status: "saved" | "closed", detail?: Record<string, unknown>): Promise<boolean> {
  const perubahan: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (detail) perubahan.detail = detail;
  const { error } = await db().from("ai_runs").update(perubahan as never).eq("id", id).eq("event_id", eventId).eq("status", "preview");
  return !error;
}
