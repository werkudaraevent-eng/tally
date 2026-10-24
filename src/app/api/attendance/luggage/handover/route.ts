import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { sesiAmbilBagasi, titipanPeserta } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Meja ambil bagasi (Check-in > Sessions > Luggage: Pick-up).
 *
 * GET: semua titipan peserta ini di acara ini, dari meja titip mana pun, dengan
 * foto dan jumlahnya. POST: serahkan semua yang masih dititipkan sekaligus.
 * DELETE: batalkan penyerahan yang dibuat petugas ini (salah tekan).
 *
 * Tiap titipan hanya bisa diserahkan sekali. Ubahan memakai saringan
 * `handed_over_at is null`, jadi dua petugas yang memindai orang yang sama
 * bersamaan tidak saling menimpa: yang kedua membaca jam dan nama petugas
 * pertama, sama seperti pemindaian ulang.
 */
const sasaran = z.object({
  session_id: z.coerce.number().int().positive(),
  participant_id: z.string().uuid(),
});

async function siapkan(request: Request, sumber: "query" | "body") {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return { response: auth.response } as const;
  const mentah = sumber === "query" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json().catch(() => null);
  const parsed = sasaran.safeParse(mentah);
  if (!parsed.success) return { response: apiError("VALIDATION_ERROR", 422, parsed.error.flatten()) } as const;
  const eventId = auth.scope.event.id;
  if (!(await sesiAmbilBagasi(eventId, parsed.data.session_id))) {
    return { response: apiError("VALIDATION_ERROR", 422, { message: "This check-in point does not hand back luggage, or it is closed." }) } as const;
  }
  return { eventId, userId: auth.user.id, participantId: parsed.data.participant_id } as const;
}

async function jawab(eventId: string, participantId: string, userId: string) {
  try {
    return Response.json({ drops: await titipanPeserta(eventId, participantId, userId) });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function GET(request: Request) {
  const siap = await siapkan(request, "query");
  if ("response" in siap) return siap.response;
  return jawab(siap.eventId, siap.participantId, siap.userId);
}

export async function POST(request: Request) {
  const siap = await siapkan(request, "body");
  if ("response" in siap) return siap.response;
  const { error } = await getSupabaseServiceClient()
    .from("luggage_drops")
    .update({ handed_over_at: new Date().toISOString(), handed_over_by: siap.userId } as never)
    .eq("event_id", siap.eventId)
    .eq("participant_id", siap.participantId)
    .gt("bag_count", 0)
    .is("handed_over_at", null);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return jawab(siap.eventId, siap.participantId, siap.userId);
}

export async function DELETE(request: Request) {
  const siap = await siapkan(request, "query");
  if ("response" in siap) return siap.response;
  // Hanya penyerahan milik petugas ini: Undo untuk salah tekan di meja, bukan
  // untuk menghapus jejak petugas lain.
  const { error } = await getSupabaseServiceClient()
    .from("luggage_drops")
    .update({ handed_over_at: null, handed_over_by: null } as never)
    .eq("event_id", siap.eventId)
    .eq("participant_id", siap.participantId)
    .eq("handed_over_by", siap.userId);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return jawab(siap.eventId, siap.participantId, siap.userId);
}
