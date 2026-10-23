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
 * transaksi. Dipakai juga untuk melepas kamar tanpa melepas hotelnya.
 */
const tempatkan = z.union([
  z.object({ room_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(20) }),
  z.object({ hotel_id: z.number().int().positive(), participant_ids: z.array(z.string().uuid()).min(1).max(2000) }),
]);

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = tempatkan.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  if ("hotel_id" in parsed.data) {
    const { data, error } = await klien().rpc("assign_hotel" as never, {
      p_event_id: auth.scope.event.id,
      p_hotel_id: parsed.data.hotel_id,
      p_participant_ids: parsed.data.participant_ids,
      p_actor: auth.user.id,
    } as never);
    if (error) return galatRpc(error);
    return Response.json({ assigned: Number(data ?? 0) });
  }

  let masuk = 0;
  for (const participantId of parsed.data.participant_ids) {
    const { error } = await klien().rpc("assign_room" as never, {
      p_event_id: auth.scope.event.id,
      p_room_id: parsed.data.room_id,
      p_participant_id: participantId,
      p_actor: auth.user.id,
    } as never);
    if (error) {
      const galat = galatRpc(error);
      if (masuk === 0) return galat;
      // Sebagian sudah masuk: kalimatnya menyebut itu, supaya panitia tidak
      // mengulang seluruh pilihan dan mengira semuanya gagal.
      const body = await galat.json();
      const alasan = body?.error?.details?.message ?? "The rest could not be added.";
      return apiError("VALIDATION_ERROR", 422, { message: `${plural(masuk, "person", "people")} added to the room. The rest were rejected: ${alasan}` });
    }
    masuk += 1;
  }
  return Response.json({ assigned: masuk });
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  // Satu atau beberapa `participant_id`: tab Peserta melepas banyak orang
  // sekaligus, panel kamar melepas satu.
  const ids = z.array(z.string().uuid()).min(1).max(200).safeParse(new URL(request.url).searchParams.getAll("participant_id"));
  if (!ids.success) return apiError("VALIDATION_ERROR", 422);

  let lepas = 0;
  for (const participantId of ids.data) {
    const { data, error } = await klien().rpc("unassign_room" as never, {
      p_event_id: auth.scope.event.id,
      p_participant_id: participantId,
      p_actor: auth.user.id,
    } as never);
    if (error) return galatRpc(error);
    if (data) lepas += 1;
  }
  return Response.json({ removed: lepas });
}
