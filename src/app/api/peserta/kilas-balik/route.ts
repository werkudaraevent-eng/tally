import { z } from "zod";
import { getMemberSession } from "@/lib/member/account";
import { memberError, requireMemberEvent } from "@/lib/member/api";
import { judulAgendaMilik, muatSetelan, pilihanPeserta, semuaJudulAgenda, simpanJawaban } from "@/lib/kilas-balik/server";
import { periksaJawaban, statusBuka } from "@/lib/kilas-balik/setelan";

/**
 * Simpan jawaban Kilas balik (/e/<slug>/kilas-balik). Peserta dikenali dari
 * sesi area peserta saja. Mengirim ulang menimpa jawaban sebelumnya selama
 * kuesioner masih dibuka.
 */
const schema = z.object({
  lang: z.enum(["id", "en"]).optional(),
  answers: z.record(z.string().max(40), z.union([z.number(), z.string().max(1000), z.array(z.string().max(80)).max(3)])).refine((v) => Object.keys(v).length <= 20),
});

export async function POST(request: Request) {
  const { event, response } = await requireMemberEvent(request);
  if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return memberError("VALIDATION_ERROR", 400, "Data tidak lengkap. Muat ulang halaman ini lalu coba lagi.");
  const lang = parsed.data.lang === "en" ? "en" : "id";
  const en = lang === "en";

  const sesi = await getMemberSession(event);
  const participantId = sesi?.participant?.id ?? null;
  if (!participantId) return memberError("UNAUTHORIZED", 401, en ? "Sign in again to send your answers." : "Masuk lagi untuk mengirim jawabanmu.");

  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat || !muat.siap) return memberError("NOT_FOUND", 404, en ? "This questionnaire isn't available." : "Kuesioner ini tidak tersedia.");
  const status = statusBuka(muat.setelan, new Date());
  if (status !== "open") {
    return memberError("CLOSED", 409, status === "closed" ? (en ? "This questionnaire has closed. Thank you!" : "Kuesioner ini sudah ditutup. Terima kasih!") : (en ? "This questionnaire isn't open yet." : "Kuesioner ini belum dibuka."));
  }

  const [semua, milikSet] = await Promise.all([semuaJudulAgenda(event.id), judulAgendaMilik(event, participantId)]);
  const semuaSet = new Set(semua);
  const hasil = periksaJawaban(muat.setelan.questions, parsed.data.answers, (q) => pilihanPeserta(q, semuaSet, milikSet));
  if (!hasil.ok) {
    return memberError("VALIDATION_ERROR", 422, en ? "A few questions still need an answer." : "Masih ada pertanyaan yang perlu dijawab.", { missing: hasil.kosong });
  }
  if (!(await simpanJawaban(event.id, participantId, hasil.jawaban))) {
    return memberError("SAVE_FAILED", 500, en ? "Your answers couldn't be sent. Try again in a moment." : "Jawabanmu belum terkirim. Coba lagi sebentar lagi.");
  }
  return Response.json({ ok: true });
}
