import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { kolomOutfitBelumAda } from "@/lib/outfit";
import { jawabanPeserta, kolomSasaran, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { bacaSyaratBaris, barisUntukPeserta, SYARAT_MAX, type SyaratBaris } from "@/lib/sasaran-baris";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Siapa yang melihat tiap baris Agenda (kolom rundown_items.audience, migrasi
// 202610210001). Admin saja, dibatasi ke event permintaan.
//
// Rute sendiri, sama dengan /sections/sasaran: sebelum migrasinya dijalankan,
// kolom yang belum ada hanya berarti `available: false` (GET) atau 409
// (PATCH), bukan CMS Agenda yang gagal dimuat.
//
//   GET    syarat tiap baris, kolom peserta yang bisa dipakai, dan hotel Logistics
//   PATCH  {id, audience}: simpan syarat satu baris (null = semua)
//   POST   {audience}: berapa peserta yang cocok, untuk hitungan di editor

const syaratSchema = z
  .array(
    z.object({
      field: z.string().regex(/^([a-z0-9_]{1,64}|@hotel)$/),
      values: z.array(z.string().trim().min(1).max(SASARAN_NILAI_PANJANG)).min(1).max(SASARAN_NILAI_MAX),
    }),
  )
  .min(1)
  .max(SYARAT_MAX)
  .nullable();

const patchSchema = z.object({ id: z.number().int().positive(), audience: syaratSchema });
const hitungSchema = z.object({ audience: syaratSchema });

type Hotel = { id: number; name: string };

async function muatHotel(eventId: string): Promise<Hotel[] | null> {
  const { data, error } = await getSupabaseServiceClient().from("lodging_hotels").select("id,name,sort_order").eq("event_id", eventId).order("sort_order").order("id");
  return error ? null : ((data ?? []) as unknown as Hotel[]).map(({ id, name }) => ({ id, name }));
}

/**
 * Syarat kiriman yang sah untuk acara ini: hanya kolom pilihan acara ini dan
 * pilihannya, atau hotel acara ini, dan satu syarat per kolom. Kolom lain bisa
 * menampilkan jawaban kolom staf yang tidak dimaksudkan, jadi ditolak.
 */
function syaratSah(
  audience: z.infer<typeof syaratSchema>,
  config: unknown,
  hotels: Hotel[],
): { syarat: SyaratBaris | null } | { galat: string } {
  if (!audience) return { syarat: null };
  const kolom = kolomSasaran(config);
  const dipakai = new Set<string>();
  for (const isi of audience) {
    if (dipakai.has(isi.field)) return { galat: "Each field can be used in one condition only." };
    dipakai.add(isi.field);
    if (isi.field === KOLOM_HOTEL) {
      if (!isi.values.every((nilai) => hotels.some((hotel) => String(hotel.id) === nilai))) return { galat: "That hotel is no longer in Logistics. Reload the page." };
      continue;
    }
    const pilihan = kolom.find((k) => k.key === isi.field);
    if (!pilihan) return { galat: "That participant field no longer exists. Reload the page." };
    if (!isi.values.every((nilai) => pilihan.options.includes(nilai))) return { galat: "That answer is no longer in the participant field. Reload the page." };
  }
  return { syarat: bacaSyaratBaris(audience) };
}

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
  const hotels = parsed.data.audience?.some((isi) => isi.field === KOLOM_HOTEL) ? await muatHotel(event.id) : [];
  if (hotels === null) return apiError("INTERNAL_ERROR", 500);
  const sah = syaratSah(parsed.data.audience, event.registration_form_config, hotels);
  if ("galat" in sah) return apiError("VALIDATION_ERROR", 422, { message: sah.galat });

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
  const auth = await requireRequestEvent(request, ["admin"]);
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
  let hotelPeserta = new Map<string, number>();
  if (tampilKamar && syarat.some((isi) => isi.field === KOLOM_HOTEL)) {
    const [tempat, kamar] = await Promise.all([
      semuaBaris<{ participant_id: string; room_id: number }>(() => db.from("lodging_assignments").select("participant_id,room_id").eq("event_id", event.id).order("id")),
      semuaBaris<{ id: number; hotel_id: number }>(() => db.from("lodging_rooms").select("id,hotel_id").eq("event_id", event.id).order("id")),
    ]);
    if (!tempat || !kamar) return apiError("INTERNAL_ERROR", 500);
    const hotelKamar = new Map(kamar.map((isi) => [isi.id, Number(isi.hotel_id)]));
    hotelPeserta = new Map(tempat.flatMap((isi) => (hotelKamar.has(isi.room_id) ? [[isi.participant_id, hotelKamar.get(isi.room_id)!] as const] : [])));
  }

  const kolom = kolomSasaran(event.registration_form_config);
  const kunci = new Set(syarat.map((isi) => isi.field));
  let matches = 0;
  for (const orang of peserta) {
    const jawaban = Object.fromEntries([...kunci].map((key) => [key, jawabanPeserta(orang.extra, key)]));
    if (barisUntukPeserta(syarat, { jawaban, hotelId: hotelPeserta.get(orang.id) ?? null, kolom })) matches += 1;
  }
  return Response.json({ matches, total: peserta.length });
}
