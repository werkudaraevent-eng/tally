import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { kolomOutfitBelumAda } from "@/lib/outfit";
import { jawabanPeserta, kolomSasaran } from "@/lib/sasaran-bagian";
import { bacaSyaratBaris, barisUntukPeserta } from "@/lib/sasaran-baris";
import { muatHotel, muatStayPeserta, periksaSyarat, syaratSchema, type StayPeserta } from "@/lib/sasaran-baris-server";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

// Siapa yang melihat tiap baris Agenda (kolom rundown_items.audience, migrasi
// 202610210001). Admin saja, dibatasi ke event permintaan.
//
// Rute sendiri, sama dengan /sections/sasaran: sebelum migrasinya dijalankan,
// kolom yang belum ada hanya berarti `available: false` (GET) atau 409
// (PATCH), bukan CMS Agenda yang gagal dimuat.
//
//   GET    syarat tiap baris, kolom peserta yang bisa dipakai, dan hotel Logistics
//   PATCH  {id, audience}: simpan syarat satu baris (null = semua). New item
//          menyimpan syaratnya lewat POST /api/admin/rundown/items.
//   POST   {audience, date?}: berapa peserta yang cocok, untuk hitungan di
//          editor. `date` = tanggal bagian baris itu, untuk Hotel (pindah hotel).

const patchSchema = z.object({ id: z.number().int().positive(), audience: syaratSchema });
const hitungSchema = z.object({ audience: syaratSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const client = getSupabaseServiceClient();

  const [baris, hotels] = await Promise.all([
    client.from("rundown_items").select("id,audience").eq("event_id", event.id).not("audience", "is", null),
    muatHotel(event.id),
  ]);
  const dasar = {
    fields: kolomSasaran(event.registration_form_config),
    hotels: hotels ?? [],
    hotels_failed: hotels === null,
    // Hotel peserta hanya terbaca bila kamar ditampilkan di Participant area.
    rooms_shown: memberConfig(event)?.show_logistics === true,
  };
  if (baris.error) {
    if (kolomOutfitBelumAda(baris.error)) return Response.json({ ...dasar, available: false, items: [] });
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json({
    ...dasar,
    available: true,
    items: ((baris.data ?? []) as unknown as Array<{ id: number; audience?: unknown }>).map((isi) => ({ id: isi.id, audience: bacaSyaratBaris(isi.audience) })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id } = parsed.data;
  const sah = await periksaSyarat(parsed.data.audience, event);
  if ("galat" in sah) return sah.galat ? apiError("VALIDATION_ERROR", 422, { message: sah.galat }) : apiError("INTERNAL_ERROR", 500);

  const client = getSupabaseServiceClient();
  const { data: current, error: galatBaca } = await client.from("rundown_items").select("id,audience").eq("event_id", event.id).eq("id", id).maybeSingle();
  if (galatBaca) return kolomOutfitBelumAda(galatBaca) ? apiError("AUDIENCE_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  if (!current) return apiError("RUNDOWN_ITEM_NOT_FOUND", 404);

  const { data, error } = await client
    .from("rundown_items")
    .update({ audience: sah.syarat, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", event.id)
    .eq("id", id)
    .select("id,audience")
    .single();
  if (error) {
    if (kolomOutfitBelumAda(error)) return apiError("AUDIENCE_NOT_READY", 409);
    return error.code === "23514" ? apiError("VALIDATION_ERROR", 422) : apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "rundown_item_audience_update",
    payload: { id, old: (current as { audience?: unknown }).audience ?? null, new: sah.syarat },
  } as never);
  const hasil = data as unknown as { id: number; audience?: unknown };
  return Response.json({ id: hasil.id, audience: bacaSyaratBaris(hasil.audience) });
}

/**
 * Berapa peserta yang melihat baris dengan syarat ini, dengan aturan yang sama
 * dengan portal (barisUntukPeserta). Peserta yang dihapus dari sumber sync
 * tidak dihitung. Hotel hanya dihitung bila kamar ditampilkan ke peserta,
 * seperti di portal.
 */
export async function POST(request: Request) {
  // Hanya membaca: hitungan tetap jalan di acara Completed atau Archived.
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const parsed = hitungSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const syarat = bacaSyaratBaris(parsed.data.audience);
  const db = getSupabaseServiceClient();
  const peserta = await semuaBaris<{ id: string; extra: Record<string, unknown> | null }>(() =>
    db.from("participants").select("id,extra").eq("event_id", event.id).is("source_removed_at", null).order("id"));
  if (!peserta) return apiError("INTERNAL_ERROR", 500);
  if (!syarat) return Response.json({ matches: peserta.length, total: peserta.length });

  const tampilKamar = memberConfig(event)?.show_logistics === true;
  let stayPeserta: StayPeserta = new Map();
  if (tampilKamar && syarat.some((isi) => isi.field === KOLOM_HOTEL)) {
    const dimuat = await muatStayPeserta(event.id);
    if (!dimuat) return apiError("INTERNAL_ERROR", 500);
    stayPeserta = dimuat;
  }
  const offset = timeZoneOffset(normalizeTimeZone((event as { time_zone?: unknown }).time_zone));

  const kolom = kolomSasaran(event.registration_form_config);
  const kunci = new Set(syarat.map((isi) => isi.field));
  let matches = 0;
  for (const orang of peserta) {
    const jawaban = Object.fromEntries([...kunci].map((key) => [key, jawabanPeserta(orang.extra, key)]));
    if (barisUntukPeserta(syarat, { jawaban, stays: stayPeserta.get(orang.id) ?? [], offset, kolom }, parsed.data.date ?? null)) matches += 1;
  }
  return Response.json({ matches, total: peserta.length });
}
