import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { sapuKedaluwarsa, stasiunBelumAda } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Cetakan terakhir sebuah stasiun dan dua angkanya: terkirim hari ini dan
 * menunggu. Daftar ini satu-satunya jalan memulihkan kertas habis atau macet:
 * Chrome tidak tahu printernya bermasalah, jadi petugas melihat namanya di
 * sini lalu menekan Print again.
 *
 * "Hari ini" mengikuti zona waktu acara (WIB, WITA, atau WIT), bukan jam server.
 */
const querySchema = z.object({ stasiun_id: z.coerce.number().int().positive() });

/** Pukul 00.00 hari ini di zona acara. Zona Indonesia tanpa DST, jadi offset tetap cukup. */
function awalHariAcara(zona: unknown, sekarang = Date.now()) {
  const [jam, menit] = timeZoneOffset(normalizeTimeZone(zona)).slice(1).split(":").map(Number);
  const geser = (jam * 60 + menit) * 60_000;
  const lokal = new Date(sekarang + geser);
  return new Date(Date.UTC(lokal.getUTCFullYear(), lokal.getUTCMonth(), lokal.getUTCDate()) - geser).toISOString();
}

type Baris = {
  id: number;
  jenis: string;
  status: string;
  galat: string | null;
  participant_id: string | null;
  lane_id: number | null;
  requested_by: string | null;
  created_at: string;
  selesai_at: string | null;
};

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;
  const stasiunId = parsed.data.stasiun_id;
  await sapuKedaluwarsa(eventId);

  const [daftar, terkirim, menunggu] = await Promise.all([
    client
      .from("badge_cetak_antrean")
      .select("id,jenis,status,galat,participant_id,lane_id,requested_by,created_at,selesai_at")
      .eq("event_id", eventId)
      .eq("stasiun_id", stasiunId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20),
    client
      .from("badge_cetak_antrean")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stasiun_id", stasiunId)
      .eq("status", "terkirim")
      .neq("jenis", "uji")
      .gte("selesai_at", awalHariAcara(auth.scope.event.time_zone)),
    client
      .from("badge_cetak_antrean")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stasiun_id", stasiunId)
      .eq("status", "antre"),
  ]);
  if (daftar.error) return stasiunBelumAda(daftar.error, daftar.status) ? apiError("STASIUN_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);

  const baris = (daftar.data ?? []) as Baris[];
  const pesertaIds = [...new Set(baris.map((b) => b.participant_id).filter((id): id is string => Boolean(id)))];
  const jalurIds = [...new Set(baris.map((b) => b.lane_id).filter((id): id is number => id != null))];
  const userIds = [...new Set(baris.map((b) => b.requested_by).filter((id): id is string => Boolean(id)))];
  const [peserta, jalur, users] = await Promise.all([
    pesertaIds.length ? client.from("participants").select("id,name").in("id", pesertaIds) : { data: [] },
    jalurIds.length ? client.from("attendance_lanes").select("id,name").in("id", jalurIds) : { data: [] },
    userIds.length ? client.from("users").select("id,username").in("id", userIds) : { data: [] },
  ]);
  const namaPeserta = new Map(((peserta.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const namaJalur = new Map(((jalur.data ?? []) as Array<{ id: number; name: string }>).map((j) => [j.id, j.name]));
  const namaUser = new Map(((users.data ?? []) as Array<{ id: string; username: string }>).map((u) => [u.id, u.username]));

  return Response.json({
    terkirim_hari_ini: terkirim.count ?? 0,
    menunggu: menunggu.count ?? 0,
    baris: baris.map((b) => ({
      id: b.id,
      jenis: b.jenis,
      status: b.status,
      galat: b.galat,
      participant_id: b.participant_id,
      nama: b.participant_id ? namaPeserta.get(b.participant_id) ?? null : null,
      // Asal permintaan: meja (jalur) bila ada, kalau tidak akun petugasnya.
      asal: (b.lane_id != null ? namaJalur.get(b.lane_id) : null) ?? (b.requested_by ? namaUser.get(b.requested_by) : null) ?? null,
      created_at: b.created_at,
      selesai_at: b.selesai_at,
    })),
  });
}
