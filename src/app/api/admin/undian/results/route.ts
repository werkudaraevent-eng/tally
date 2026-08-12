import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { buildPrizeRecap, buildTimeline, loadWinners } from "@/lib/undian-results";

// Detail hasil satu sesi untuk layar riwayat.
//
// Memakai modul yang sama dengan endpoint export, sehingga angka di layar dan
// angka di berkas Excel tidak pernah berbeda. Kalau keduanya menyusun querynya
// sendiri, panitia yang membandingkan keduanya akan menemukan selisih dan tidak
// tahu mana yang benar.

const querySchema = z.object({
  // Kosong berarti seluruh riwayat, termasuk baris tanpa sesi.
  session: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  try {
    const winners = await loadWinners(auth.scope.event.id, parsed.data.session ?? null);
    return Response.json({
      winners,
      timeline: buildTimeline(winners),
      recap: buildPrizeRecap(winners),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
