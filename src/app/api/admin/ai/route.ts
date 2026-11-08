import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { sandikan } from "@/lib/ai/kunci";
import { awalBulan, FITUR_AI, MODEL_AI, modelAi } from "@/lib/ai/model";
import { bacaSetelanMentah, rapikanSetelan } from "@/lib/ai/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Halaman AI (/ai): setelan dan pemakaian AI untuk seluruh Tally.
 *
 * Super admin saja, eksplisit (bukan pelebaran "admin"): kunci API dan tagihan
 * berlaku untuk semua acara. Kunci asli tidak pernah dikirim balik; GET hanya
 * menyebut 4 karakter terakhirnya.
 *
 * GET    setelan + pemakaian (bulan ini, bulan lalu, 50 pemakaian terakhir)
 * PATCH  model bawaan, model per fitur, fitur mati, batas bulanan
 * POST   { api_key }: dicek ke Anthropic dulu, lalu disimpan sebagai sandi
 * DELETE hapus kunci (semua tombol AI berhenti)
 */

const db = () => getSupabaseServiceClient();
const belum = () => apiError("VALIDATION_ERROR", 422, { message: "AI needs a database update first. Run the AI settings migration (202611080070), then reload." });

type Run = {
  id: number; created_at: string; event_id: string | null; user_id: string | null; feature: string; model: string;
  file_names: string[] | null; input_tokens: number; output_tokens: number; cost_usd: number | string; status: string; detail: Record<string, unknown> | null;
};

async function bacaRun(sejak: string): Promise<Run[] | null> {
  const semua: Run[] = [];
  for (let terakhir = 0; ;) {
    const { data, error } = await db().from("ai_runs").select("id,created_at,event_id,user_id,feature,model,file_names,input_tokens,output_tokens,cost_usd,status,detail").gte("created_at", sejak).gt("id", terakhir).order("id").limit(1000);
    if (error || !Array.isArray(data)) return null;
    semua.push(...(data as Run[]));
    if (data.length < 1000) break;
    terakhir = (data[data.length - 1] as Run).id;
  }
  return semua;
}

function ringkas(runs: Run[]) {
  const perAcara = new Map<string, number>();
  const perFitur = new Map<string, { runs: number; usd: number }>();
  const hasil = { saved: 0, closed: 0, failed: 0, preview: 0 };
  let usd = 0, masuk = 0, keluar = 0;
  for (const r of runs) {
    const biaya = Number(r.cost_usd) || 0;
    usd += biaya; masuk += r.input_tokens; keluar += r.output_tokens;
    const k = r.event_id ?? "";
    perAcara.set(k, (perAcara.get(k) ?? 0) + biaya);
    const f = perFitur.get(r.feature) ?? { runs: 0, usd: 0 };
    perFitur.set(r.feature, { runs: f.runs + 1, usd: f.usd + biaya });
    if (r.status in hasil) hasil[r.status as keyof typeof hasil] += 1;
  }
  return {
    runs: runs.length, usd, token_masuk: masuk, token_keluar: keluar, hasil,
    per_acara: [...perAcara].map(([event_id, biaya]) => ({ event_id: event_id || null, usd: biaya })).sort((a, b) => b.usd - a.usd),
    per_fitur: Object.fromEntries(perFitur),
  };
}

export async function GET() {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const mentah = await bacaSetelanMentah();
  if (mentah === "belum") return Response.json({ belum_migrasi: true, model: MODEL_AI, fitur: FITUR_AI });
  if (!mentah) return apiError("INTERNAL_ERROR", 500);

  const sekarang = new Date();
  const bulanIni = awalBulan(sekarang);
  const bulanLalu = new Date(Date.UTC(bulanIni.getUTCFullYear(), bulanIni.getUTCMonth() - 1, 1));
  const runs = await bacaRun(bulanLalu.toISOString());
  if (!runs) return apiError("INTERNAL_ERROR", 500);
  const ini = runs.filter((r) => new Date(r.created_at) >= bulanIni);
  const lalu = runs.filter((r) => new Date(r.created_at) < bulanIni);

  const terakhir = await db().from("ai_runs").select("id,created_at,event_id,user_id,feature,model,file_names,input_tokens,output_tokens,cost_usd,status,detail").order("id", { ascending: false }).limit(50);
  if (terakhir.error) return apiError("INTERNAL_ERROR", 500);
  const daftar = (terakhir.data ?? []) as Run[];

  const idAcara = [...new Set([...runs, ...daftar].map((r) => r.event_id).filter((id): id is string => Boolean(id)))];
  const idUser = [...new Set(daftar.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
  const [acara, pengguna] = await Promise.all([
    idAcara.length ? db().from("events").select("id,name").in("id", idAcara.slice(0, 500)) : Promise.resolve({ data: [], error: null }),
    idUser.length ? db().from("users").select("id,username").in("id", idUser) : Promise.resolve({ data: [], error: null }),
  ]);
  const namaAcara = Object.fromEntries(((acara.data ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]));
  const namaUser = Object.fromEntries(((pengguna.data ?? []) as Array<{ id: string; username: string }>).map((u) => [u.id, u.username]));

  return Response.json({
    setelan: rapikanSetelan(mentah),
    model: MODEL_AI,
    fitur: FITUR_AI,
    bulan_ini: { mulai: bulanIni.toISOString(), ...ringkas(ini) },
    bulan_lalu: { mulai: bulanLalu.toISOString(), ...ringkas(lalu) },
    nama_acara: namaAcara,
    terakhir: daftar.map((r) => ({
      id: r.id, waktu: r.created_at, acara: r.event_id ? namaAcara[r.event_id] ?? null : null, oleh: r.user_id ? namaUser[r.user_id] ?? null : null,
      fitur: r.feature, model: modelAi(r.model)?.label ?? r.model, berkas: r.file_names ?? [], token_masuk: r.input_tokens, token_keluar: r.output_tokens,
      usd: Number(r.cost_usd) || 0, detail: r.detail ?? {},
      // Pratinjau yang ditinggal (tab ditutup tanpa Save/Cancel) tidak pernah diberi status akhir.
      status: r.status === "preview" && sekarang.getTime() - new Date(r.created_at).getTime() > 30 * 60_000 ? "left" : r.status,
    })),
  });
}

const idModel = z.string().refine((id) => Boolean(modelAi(id)), "Choose a model from the list.");
const kunciFitur = z.string().refine((k) => FITUR_AI.some((f) => f.key === k));
const patchSchema = z.object({
  default_model: idModel.optional(),
  feature_models: z.record(kunciFitur, idModel).optional(),
  features_off: z.array(kunciFitur).max(50).optional(),
  monthly_limit_usd: z.number().min(0).max(10000).optional(),
}).strict();

async function simpan(perubahan: Record<string, unknown>, userId: string) {
  return db().from("ai_settings").upsert({ id: true, ...perubahan, updated_at: new Date().toISOString(), updated_by: userId } as never, { onConflict: "id" });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if ((await bacaSetelanMentah()) === "belum") return belum();
  const { error } = await simpan({ ...parsed.data, ...(parsed.data.monthly_limit_usd !== undefined ? { monthly_limit_usd: Math.round(parsed.data.monthly_limit_usd * 100) / 100 } : {}) }, auth.user.id);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}

const kunciSchema = z.object({ api_key: z.string().trim().min(20, "This does not look like an API key.").max(400) });

export async function POST(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const parsed = kunciSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, { message: parsed.error.issues[0]?.message ?? "Paste the API key." });
  const mentah = await bacaSetelanMentah();
  if (mentah === "belum") return belum();
  if (!mentah) return apiError("INTERNAL_ERROR", 500);

  // Dicek dulu dengan membaca info model (tanpa biaya token), supaya kunci
  // salah ketik tidak tersimpan lalu baru ketahuan saat panitia menekan tombol.
  try {
    await new Anthropic({ apiKey: parsed.data.api_key, maxRetries: 0, timeout: 20_000 }).models.retrieve(rapikanSetelan(mentah).modelBawaan);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return apiError("VALIDATION_ERROR", 422, { message: "Anthropic refused this key. Check that you copied all of it." });
    if (error instanceof Anthropic.PermissionDeniedError) return apiError("VALIDATION_ERROR", 422, { message: "This key has no access to the chosen model. Check the key's workspace in the Anthropic console." });
    return apiError("VALIDATION_ERROR", 422, { message: "The key could not be checked: Anthropic did not answer. Try again." });
  }

  let sandi: string;
  try {
    sandi = sandikan(parsed.data.api_key);
  } catch {
    return apiError("INTERNAL_ERROR", 500, { message: "The server is missing its encryption secret. Ask your Tally developer." });
  }
  const { error } = await simpan({ api_key_cipher: sandi, api_key_last4: parsed.data.api_key.slice(-4), key_checked_at: new Date().toISOString() }, auth.user.id);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true, kunci_akhir: parsed.data.api_key.slice(-4) });
}

export async function DELETE() {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  if ((await bacaSetelanMentah()) === "belum") return belum();
  const { error } = await simpan({ api_key_cipher: null, api_key_last4: null, key_checked_at: null }, auth.user.id);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}
