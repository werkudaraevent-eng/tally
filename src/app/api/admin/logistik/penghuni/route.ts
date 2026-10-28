import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { galatRpc, klien } from "@/lib/logistik/server";
import { plural } from "@/lib/plural";

/**
 * Menempatkan peserta di kamar atau di hotel saja, dan mengeluarkannya.
 *
 * Kamar: satu panggilan `assign_room` per orang, berurutan. RPC itu mengunci
 * kamar dan memeriksa kapasitas serta jenis kelamin di transaksinya sendiri;
 * memanggilnya satu per satu berarti penempatan yang sudah berhasil tetap
 * tersimpan ketika orang ketiga ditolak, dan jawaban menyebut berapa yang masuk.
 *
 * Hotel saja (`hotel_id`, nomor kamar menyusul): satu panggilan
 * `assign_hotel` untuk semua orang. Tanpa aturan kamar, jadi tidak ada yang
 * ditolak satu per satu, dan rombongan ratusan orang selesai dalam satu
 * transaksi.
 *
 * Malam (`check_in_at` + `check_out_at`, "Only some nights"): `set_stay` dulu,
 * yang memotong stay lain yang bertabrakan; tanpa malam ("All nights") semua
 * stay diganti satu stay. Dengan kamar, kamarnya diisi sesudah stay-nya ada,
 * jadi `assign_room` mengisi stay itu dan tidak menghapus hotel lain.
 * `trim: false`: tanpa memotong stay lain. Dialog beberapa hotel melepas hotel
 * yang tidak dipilih lebih dulu dan sudah menolak malam yang bertabrakan;
 * memotong di sana bisa menghapus stay (dan kamarnya) yang ditulis sesudahnya.
 *
 * `release_room_id`: lepas kamar, hotel dan malamnya tetap (Rooms > hapus
 * penghuni).
 *
 * Pindah kamar di hotel yang sama (migrasi 202610280001): satu orang boleh
 * punya dua stay di satu hotel, jadi dialog Stays menyebut stay-nya
 * (`stay_id`, satu orang). `tambah`: stay baru, juga di hotel yang sudah ada.
 *
 * PUT: dialog Assign menulis seluruh stay tiap orang sekaligus lewat
 * `replace_stays`, satu transaksi. Isi kamar diperiksa per malam sesudah
 * semuanya tertulis.
 */
const malam = {
  check_in_at: z.string().datetime({ offset: true }).optional(),
  check_out_at: z.string().datetime({ offset: true }).optional(),
  trim: z.literal(false).optional(),
  stay_id: z.number().int().positive().optional(),
};
const satuOrangBilaStay = (isi: { stay_id?: number; participant_ids: string[] }) => isi.stay_id === undefined || isi.participant_ids.length === 1;
const adaMalam = (isi: { check_in_at?: string; check_out_at?: string }) => (isi.check_in_at === undefined) === (isi.check_out_at === undefined);
const tempatkan = z.union([
  z.object({ room_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(20), ...malam }).strict().refine(adaMalam).refine(satuOrangBilaStay),
  z.object({ hotel_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(2000), ...malam, tambah: z.literal(true).optional() })
    .strict().refine(adaMalam).refine(satuOrangBilaStay).refine((isi) => !(isi.tambah && isi.stay_id)),
  z.object({ release_room_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(200) }).strict(),
]);

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = tempatkan.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const isi = parsed.data;

  if ("release_room_id" in isi) {
    const { data, error } = await klien().rpc("release_room" as never, {
      p_event_id: eventId,
      p_room_id: isi.release_room_id,
      p_participant_ids: isi.participant_ids,
      p_actor: auth.user.id,
    } as never);
    if (error) return galatRpc(error);
    return Response.json({ released: Number(data ?? 0) });
  }

  let hotelId = "hotel_id" in isi ? isi.hotel_id : null;
  if ("room_id" in isi && isi.check_in_at) {
    const { data: kamar } = await klien().from("lodging_rooms").select("hotel_id").eq("event_id", eventId).eq("id", isi.room_id).maybeSingle();
    if (!kamar) return galatRpc({ message: "ROOM_NOT_FOUND" });
    hotelId = Number((kamar as { hotel_id: number }).hotel_id);
  }

  if (hotelId !== null) {
    // Tanpa malam: `assign_hotel` mengganti semua stay. Stay tertentu atau
    // stay tambahan selalu bermalam.
    if (!isi.check_in_at && (isi.stay_id || ("tambah" in isi && isi.tambah))) return apiError("VALIDATION_ERROR", 422);
    const { data, error } = isi.check_in_at
      ? await klien().rpc("set_stay" as never, {
          p_event_id: eventId,
          p_hotel_id: hotelId,
          p_participant_ids: isi.participant_ids,
          p_check_in_at: isi.check_in_at,
          p_check_out_at: isi.check_out_at,
          p_actor: auth.user.id,
          ...(isi.trim === false ? { p_trim: false } : {}),
          ...(isi.stay_id ? { p_stay_id: isi.stay_id } : {}),
          ...("tambah" in isi && isi.tambah ? { p_tambah: true } : {}),
        } as never)
      : await klien().rpc("assign_hotel" as never, {
          p_event_id: eventId,
          p_hotel_id: hotelId,
          p_participant_ids: isi.participant_ids,
          p_actor: auth.user.id,
        } as never);
    if (error) return galatRpc(error);
    if (!("room_id" in isi)) return Response.json({ assigned: Number(data ?? 0) });
  }

  let masuk = 0;
  for (const participantId of isi.participant_ids) {
    const { error } = await klien().rpc("assign_room" as never, {
      p_event_id: eventId,
      p_room_id: (isi as { room_id: number }).room_id,
      p_participant_id: participantId,
      p_actor: auth.user.id,
      ...(isi.stay_id ? { p_stay_id: isi.stay_id } : {}),
    } as never);
    if (error) {
      const galat = galatRpc(error);
      // Dengan malam, stay hotelnya sudah tersimpan sebelum kamar ditolak:
      // kalimatnya menyebut itu, supaya panitia tahu mereka "Room to follow".
      const sisaStay = isi.check_in_at ? " They still have this hotel for these nights, with the room to follow." : "";
      if (masuk === 0 && !sisaStay) return galat;
      // Sebagian sudah masuk: kalimatnya menyebut itu, supaya panitia tidak
      // mengulang seluruh pilihan dan mengira semuanya gagal.
      const body = await galat.json();
      const alasan = body?.error?.details?.message ?? "The rest could not be added.";
      const awal = masuk === 0 ? `Not added to the room: ${alasan}` : `${plural(masuk, "person", "people")} added to the room. The rest were rejected: ${alasan}`;
      return apiError("VALIDATION_ERROR", 422, { message: `${awal}${sisaStay}` });
    }
    masuk += 1;
  }
  return Response.json({ assigned: masuk });
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  // Satu atau beberapa `participant_id`: tab Peserta melepas banyak orang
  // sekaligus, panel kamar melepas satu. `hotel_id` = lepas stay di hotel itu
  // saja; tanpa itu semua stay orangnya dilepas.
  const url = new URL(request.url);
  const ids = z.array(z.string().uuid()).min(1).max(200).safeParse(url.searchParams.getAll("participant_id"));
  const hotel = z.coerce.number().int().positive().optional().safeParse(url.searchParams.get("hotel_id") ?? undefined);
  // `stay_id`: satu stay saja, untuk satu orang (dua stay di hotel yang sama).
  const stay = z.coerce.number().int().positive().optional().safeParse(url.searchParams.get("stay_id") ?? undefined);
  if (!ids.success || !hotel.success || !stay.success) return apiError("VALIDATION_ERROR", 422);
  if (stay.data && ids.data.length !== 1) return apiError("VALIDATION_ERROR", 422);

  let lepas = 0;
  for (const participantId of ids.data) {
    const { data, error } = await klien().rpc("unassign_room" as never, {
      p_event_id: auth.scope.event.id,
      p_participant_id: participantId,
      p_actor: auth.user.id,
      ...(hotel.data ? { p_hotel_id: hotel.data } : {}),
      ...(stay.data ? { p_stay_id: stay.data } : {}),
    } as never);
    if (error) return galatRpc(error);
    if (data) lepas += 1;
  }
  return Response.json({ removed: lepas });
}

const isiStay = z.object({
  hotel_id: z.number().int().positive(),
  room_id: z.number().int().positive().nullable(),
  check_in_at: z.string().datetime({ offset: true }).nullable(),
  check_out_at: z.string().datetime({ offset: true }).nullable(),
}).strict().refine((s) => (s.check_in_at === null) === (s.check_out_at === null));
const gantiStay = z.object({
  items: z.array(z.object({ participant_id: z.string().uuid(), stays: z.array(isiStay).max(6) }).strict()).min(1).max(2000),
}).strict().refine((isi) => new Set(isi.items.map((i) => i.participant_id)).size === isi.items.length);

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = gantiStay.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await klien().rpc("replace_stays" as never, {
    p_event_id: auth.scope.event.id,
    p_items: parsed.data.items,
    p_actor: auth.user.id,
  } as never);
  if (error) return galatRpc(error);
  return Response.json({ assigned: Number(data ?? 0) });
}
