import { requireRequestEvent } from "@/lib/auth/request-event";
import { loadSeatOptions } from "@/lib/seat-tally";

/**
 * Data field Seat di modal sunting peserta: sesi denah yang kursinya diisi di
 * Tally, label kursi yang ada di denah, dan siapa memegang kursi mana. Untuk
 * acara tanpa sesi seperti itu jawabannya kosong dan modal tidak berubah.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  return Response.json(await loadSeatOptions(auth.scope.event.id));
}
