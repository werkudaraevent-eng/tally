import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import {
  VOTE_CONTENT_TYPES,
  buildVoteCsv,
  buildVoteXlsx,
  loadVoteExport,
  voteExportFilename,
} from "@/lib/vote-export";

const paramsSchema = z.coerce.number().int().positive();

/**
 * Unduh hasil satu pertanyaan.
 *
 * `readOnly: true` karena ini GET yang tidak menulis apa pun: penjaga tulis di
 * requireRequestEvent tidak boleh menghalangi panitia mengunduh hasil dari event
 * yang sudah selesai atau diarsipkan — justru di sanalah ekspor paling
 * dibutuhkan, saat laporan diserahkan ke klien.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    const data = await loadVoteExport(auth.scope.event.id, id.data);
    if (!data) return apiError("VOTE_POLL_NOT_FOUND", 404);

    const body = format === "xlsx" ? await buildVoteXlsx(data) : buildVoteCsv(data);
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": VOTE_CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${voteExportFilename(format, auth.scope.event.slug, data.question)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
