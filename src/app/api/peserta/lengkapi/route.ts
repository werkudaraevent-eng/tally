import { z } from "zod";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { memberError } from "@/lib/member/api";
import { readDataToken, saveAnswers } from "@/lib/member/lengkapi";

/**
 * Simpan jawaban dari halaman Lengkapi data (/e/<slug>/lengkapi).
 *
 * Peserta dikenali dari tautan pribadi (`token`, tujuan `data`) atau, tanpa
 * token, dari sesi area peserta. Tidak bergantung pada area peserta menyala:
 * kiriman Update details link boleh dipakai acara tanpa area peserta.
 */
const schema = z.object({
  token: z.string().trim().min(20).max(100).optional(),
  lang: z.enum(["id", "en"]).optional(),
  extra: z.record(z.string(), z.string().max(4000)).refine((nilai) => Object.keys(nilai).length <= 50),
});

export async function POST(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event || event.status === "archived") return memberError("NOT_FOUND", 404, "Acara tidak ditemukan.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Data tidak lengkap. Muat ulang halaman ini lalu coba lagi.");
  const en = parsed.data.lang === "en";

  let participantId: string | null = null;
  if (parsed.data.token) {
    participantId = (await readDataToken(event.id, parsed.data.token))?.participantId ?? null;
  } else if (memberConfig(event)) {
    participantId = (await getMemberSession(event))?.participant?.id ?? null;
  }
  if (!participantId) {
    return memberError(
      "INVALID",
      401,
      en ? "This link has expired. Ask the organisers for a new one." : "Tautan ini sudah tidak berlaku. Minta tautan baru ke panitia.",
    );
  }

  const hasil = await saveAnswers(event, participantId, parsed.data.extra);
  switch (hasil.status) {
    case "ok":
      return Response.json({ ok: true });
    case "invalid":
      return memberError(
        "VALIDATION_ERROR",
        422,
        en ? "Check the highlighted answers." : "Periksa lagi jawaban yang ditandai.",
        Object.fromEntries(hasil.issues.map((issue) => [issue.key, issue.message])),
      );
    case "no_fields":
      return memberError("NO_FIELDS", 409, en ? "There is nothing to fill in right now." : "Saat ini tidak ada data yang perlu diisi.");
    default:
      return memberError("NOT_FOUND", 404, en ? "Your participant data wasn't found. Contact the organisers." : "Data peserta tidak ditemukan. Hubungi panitia.");
  }
}
