import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { galatRpc, klien } from "@/lib/logistik/server";

/**
 * Menempatkan peserta di bus.
 *
 *   trip_id null,    vehicle_id terisi   bus bawaan
 *   trip_id null,    vehicle_id null     lepas bus bawaan
 *   trip_id terisi,  vehicle_id terisi   pengganti di satu agenda
 *   trip_id terisi,  vehicle_id null     tidak naik bus di agenda itu
 *
 * DELETE mengembalikan peserta ke bus bawaannya di satu agenda.
 *
 * Seluruh pilihan masuk dalam SATU panggilan `assign_bus`, jadi semuanya
 * masuk atau semuanya ditolak: bus yang kurang dua kursi untuk rombongan satu
 * perusahaan tidak boleh berakhir memuat separuh rombongannya.
 */
const tempatkan = z.object({
  trip_id: z.number().int().positive().nullable(),
  vehicle_id: z.number().int().positive().nullable(),
  participant_ids: z.array(z.string().uuid()).min(1).max(2000),
});

const kembalikan = z.object({
  trip_id: z.number().int().positive(),
  participant_ids: z.array(z.string().uuid()).min(1).max(2000),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = tempatkan.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await klien().rpc("assign_bus" as never, {
    p_event_id: auth.scope.event.id,
    p_trip_id: parsed.data.trip_id,
    p_vehicle_id: parsed.data.vehicle_id,
    p_participant_ids: parsed.data.participant_ids,
    p_actor: auth.user.id,
  } as never);
  if (error) return galatRpc(error);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = kembalikan.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await klien().rpc("reset_bus_override" as never, {
    p_event_id: auth.scope.event.id,
    p_trip_id: parsed.data.trip_id,
    p_participant_ids: parsed.data.participant_ids,
    p_actor: auth.user.id,
  } as never);
  if (error) return galatRpc(error);
  return Response.json(data);
}
