import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { deckKePptx } from "@/lib/laporan/pptx";
import { hitungLaporan, muatLaporan } from "@/lib/laporan/server";

/** Download PowerPoint: deck dari data terbaru dan config tersimpan. */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const laporan = await muatLaporan(event.id).catch(() => null);
  if (!laporan?.siap) return apiError("INTERNAL_ERROR", 500);
  const susun = await hitungLaporan(event, laporan.config).catch(() => null);
  if (!susun) return apiError("INTERNAL_ERROR", 500);
  const berkas = await deckKePptx(susun.deck);
  return new Response(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${event.slug}-event-report.pptx"`,
      "Cache-Control": "no-store",
    },
  });
}
