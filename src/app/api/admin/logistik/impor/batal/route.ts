import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { batalkanImpor, imporTerakhirBisaUndo } from "@/lib/logistik/jejak-impor";

/**
 * "Undo this import" untuk impor Hotel stays.
 *
 * GET: impor terakhir acara ini yang masih bisa di-undo (atau `null`).
 * POST `{ id }`: pratinjau, apa saja yang akan kembali dan apa yang dibiarkan.
 * POST `{ id, terapkan: true }`: menjalankannya. Hanya impor terakhir yang
 * belum dibatalkan, paling lama 7 hari; yang lain dijawab 409.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  return Response.json({ impor: await imporTerakhirBisaUndo(auth.scope.event.id) });
}

const Masukan = z.object({ id: z.number().int().positive(), terapkan: z.boolean().optional() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const masukan = Masukan.safeParse(await request.json().catch(() => null));
  if (!masukan.success) return apiError("VALIDATION_ERROR", 422);
  const hasil = await batalkanImpor(auth.scope.event.id, auth.user.id, masukan.data.id, masukan.data.terapkan === true);
  if (hasil === "STALE") return apiError("CONFLICT", 409, { message: "This import can no longer be undone. Someone may have undone it already, or a newer import was saved." });
  if (hasil === "galat") return apiError("INTERNAL_ERROR", 500);
  return Response.json({ hasil });
}
