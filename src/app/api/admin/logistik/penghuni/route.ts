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
 *
 * `release_room_id`: lepas kamar, hotel dan malamnya tetap (Rooms > hapus
 * penghuni).
 */
const malam = {
  check_in_at: z.string().datetime({ offset: true }).optional(),
  check_out_at: z.string().datetime({ offset: true }).optional(),
};
const adaMalam = (isi: { check_in_at?: string; check_out_at?: string }) => (isi.check_in_at === undefined) === (isi.check_out_at === undefined);
const tempatkan = z.union([
  z.object({ room_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(20), ...malam }).strict().refine(adaMalam),
  z.object({ hotel_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(2000), ...malam }).strict().refine(adaMalam),
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
    const { data, error } = isi.check_in_at
      ? await klien().rpc("set_stay" as never, {
          p_event_id: eventId,
          p_hotel_id: hotelId,
          p_participant_ids: isi.participant_ids,
          p_check_in_at: isi.check_in_at,
          p_check_out_at: isi.check_out_at,
          p_actor: auth.user.id,
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
    } as never);
    if (error) {
      const galat = galatRpc(error);
      // Dengan malam, stay hotelnya sudah tersimpan sebelum kamar ditolak:
      // kalimatnya menyebut itu, supaya panitia tahu mereka "Room to follow".
      const sisaStay = hotelId !== null ? " They still have this hotel for these nights, with the room to follow." : "";
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
  if (!ids.success || !hotel.success) return apiError("VALIDATION_ERROR", 422);

  let lepas = 0;
  for (const participantId of ids.data) {
    const { data, error } = await klien().rpc("unassign_room" as never, {
      p_event_id: auth.scope.event.id,
      p_participant_id: participantId,
      p_actor: auth.user.id,
      ...(hotel.data ? { p_hotel_id: hotel.data } : {}),
    } as never);
    if (error) return galatRpc(error);
    if (data) lepas += 1;
  }
  return Response.json({ removed: lepas });
}
