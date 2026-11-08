import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bacaSetelanHari, BATAS_HARIAN, hariSah, SETELAN_KOSONG } from "@/lib/laporan/harian/config";
import { fotoLaporanSah } from "@/lib/laporan/harian/foto";
import { hurufAcara, muatHarian } from "@/lib/laporan/harian/server";
import { muatBahanLaporan } from "@/lib/laporan/bahan-server";
import { hariAcara, susunHari, susunRingkasan } from "@/lib/laporan/harian/hitung";
import { RINGKASAN } from "@/lib/laporan/harian/jenis";
import { muatLaporan, simpanConfig } from "@/lib/laporan/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Admin > Event report > Daily highlights. Disimpan di event_reports.config.harian
 * (migrasi 202611080060, tanpa migrasi baru).
 *
 * GET  ?tanggal=YYYY-MM-DD  daftar hari, setelan dan highlight hari itu.
 *      `tanggal` juga bisa "semua": story Seluruh acara (acara lebih dari satu hari).
 * PUT  { tanggal, setelan: { sembunyi, catatan, foto, tanpa }, updated_at }  simpan setelan.
 * POST { tanggal, aksi: "kunci" | "buka", updated_at }  kunci angka saat ini, atau buka lagi.
 * updated_at = yang DIMUAT (compare-and-swap); 409 bila diubah di tab lain.
 */

const fotoSah = (u: string) => fotoLaporanSah(u, process.env.NEXT_PUBLIC_SUPABASE_URL);

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const laporan = await muatLaporan(auth.scope.event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });
  const tanggal = new URL(request.url).searchParams.get("tanggal");
  const data = await muatHarian(auth.scope.event, laporan.config, tanggal && hariSah(tanggal) ? tanggal : null).catch(() => null);
  if (!data) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ siap: true, updated_at: laporan.updated_at, tautan: laporan.config.tautan, slug: auth.scope.event.slug, ...data });
}

type Body = { tanggal?: unknown; setelan?: unknown; aksi?: unknown; updated_at?: unknown };

async function baca(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.tanggal !== "string" || !hariSah(body.tanggal) || !(body.updated_at === null || typeof body.updated_at === "string")) return null;
  return body as Body & { tanggal: string; updated_at: string | null };
}

function jawab(hasil: Awaited<ReturnType<typeof simpanConfig>>, isi: Record<string, unknown> = {}) {
  if (hasil.ok) return Response.json({ ok: true, updated_at: hasil.updated_at, ...isi });
  if (hasil.alasan === "belum_siap") return Response.json({ siap: false });
  if (hasil.alasan === "basi") return apiError("CONFLICT", 409);
  return apiError("INTERNAL_ERROR", 500);
}

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = await baca(request);
  if (!body || typeof body.setelan !== "object") return apiError("VALIDATION_ERROR", 422);
  const laporan = await muatLaporan(auth.scope.event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });
  const lama = laporan.config.harian[body.tanggal];
  if (!lama && body.tanggal !== RINGKASAN && Object.keys(laporan.config.harian).filter((t) => t !== RINGKASAN).length >= BATAS_HARIAN.hari) return apiError("VALIDATION_ERROR", 422);
  // Salinan terkunci tidak bisa dikirim dari klien: selalu yang sudah tersimpan.
  const setelan = { ...bacaSetelanHari(body.setelan, fotoSah), kunci: lama?.kunci ?? null };
  const config = { ...laporan.config, harian: { ...laporan.config.harian, [body.tanggal]: setelan } };
  return jawab(await simpanConfig(auth.scope.event.id, config, body.updated_at, auth.user.id), { setelan });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const body = await baca(request);
  if (!body || (body.aksi !== "kunci" && body.aksi !== "buka")) return apiError("VALIDATION_ERROR", 422);
  const laporan = await muatLaporan(event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });
  const lama = laporan.config.harian[body.tanggal] ?? { ...SETELAN_KOSONG };
  let kunci = null;
  if (body.aksi === "kunci") {
    const bahan = await muatBahanLaporan(event, laporan.config).catch(() => null);
    if (!bahan) return apiError("INTERNAL_ERROR", 500);
    if (body.tanggal === RINGKASAN) {
      // Seluruh acara hanya untuk acara lebih dari satu hari.
      if (hariAcara(bahan).length < 2) return apiError("VALIDATION_ERROR", 422);
      kunci = { at: new Date().toISOString(), hari: susunRingkasan(bahan, lama, hurufAcara(event)).hari };
    } else {
      if (!bahan.sesi.some((s) => s.tanggal === body.tanggal)) return apiError("VALIDATION_ERROR", 422);
      kunci = { at: new Date().toISOString(), hari: susunHari(bahan, body.tanggal, lama, hurufAcara(event)).hari };
    }
  }
  const config = { ...laporan.config, harian: { ...laporan.config.harian, [body.tanggal]: { ...lama, kunci } } };
  const hasil = await simpanConfig(event.id, config, body.updated_at, auth.user.id);
  if (hasil.ok) {
    await getSupabaseServiceClient()
      .from("audit_logs")
      .insert({ event_id: event.id, user_id: auth.user.id, action: kunci ? "daily_highlight_lock" : "daily_highlight_unlock", payload: { tanggal: body.tanggal } } as never);
  }
  return jawab(hasil, { kunci });
}
