import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { catatRun, siapkanFitur } from "@/lib/ai/server";
import { BATAS_PERTANYAAN, FITUR_TANYA, promptKonteks, promptPanduan, saringJawaban, SKEMA_TANYA, tokenMasukSetara, type HalamanTanya, type JawabanTanya } from "@/lib/ai/tanya";

/**
 * Ask AI di Quick search (Ctrl K).
 *
 * GET: `{ siap }`, apakah baris Ask AI ditampilkan. Tidak ada kunci, fitur
 * mati, batas bulanan tercapai, atau sebelum migrasi AI: false, dan Quick
 * search tetap seperti sebelumnya.
 * POST `{ pertanyaan, halaman }`: jawaban singkat, langkah, dan paling banyak
 * dua tautan ke halaman di `halaman`. Daftar halaman dikirim Quick search:
 * menu yang sama dengan sidebar, sudah disaring untuk peran penanya (menu
 * berisi ikon komponen klien, jadi tidak bisa diimpor route ini). Isinya
 * hanya memengaruhi jawaban untuk penanya sendiri, dan tautannya tetap hanya
 * alamat relatif di dalam Tally.
 *
 * Panduan fitur (docs/PRODUCT.md) dibaca dari berkas (lihat
 * outputFileTracingIncludes di next.config.ts) dan dikirim sebagai prompt
 * sistem yang di-cache, jadi pertanyaan berikutnya dalam 5 menit murah.
 */

const PERAN: Array<"admin"> = ["admin"];

let panduanCache: string | null = null;
async function panduan(): Promise<string | null> {
  if (panduanCache) return panduanCache;
  try {
    panduanCache = await readFile(path.join(process.cwd(), "docs", "PRODUCT.md"), "utf8");
    return panduanCache;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, PERAN);
  if (auth.response) return auth.response;
  const siap = await siapkanFitur(FITUR_TANYA);
  return Response.json({ siap: siap.siap });
}

const Halaman = z.object({
  href: z.string().regex(/^\/[a-z0-9\-/]*$/).max(80),
  label: z.string().trim().min(1).max(60),
  konteks: z.string().trim().max(60),
  uraian: z.string().trim().max(200),
});
const Masukan = z.object({ pertanyaan: z.string().trim().min(2).max(BATAS_PERTANYAAN), halaman: z.array(Halaman).min(1).max(80) });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, PERAN);
  if (auth.response) return auth.response;
  const masukan = Masukan.safeParse(await request.json().catch(() => null));
  if (!masukan.success) {
    const panjang = masukan.error.issues.some((i) => i.path[0] === "pertanyaan");
    return apiError("VALIDATION_ERROR", 422, { message: panjang ? `Ask in at most ${BATAS_PERTANYAAN} characters.` : "Reload the page, then ask again." });
  }
  const siap = await siapkanFitur(FITUR_TANYA);
  if (!siap.siap) return apiError("VALIDATION_ERROR", 422, { message: siap.pesan });
  const teksPanduan = await panduan();
  if (!teksPanduan) return apiError("INTERNAL_ERROR", 500);

  const halaman: HalamanTanya[] = masukan.data.halaman;
  const event = auth.scope.event;
  const catat = (tokenMasuk: number, tokenKeluar: number, status: "saved" | "failed", detail: Record<string, unknown>) =>
    catatRun({ eventId: event.id, userId: auth.user.id, fitur: FITUR_TANYA, model: siap.model, berkas: [], tokenMasuk, tokenKeluar, status, detail: { pertanyaan: masukan.data.pertanyaan.slice(0, 200), ...detail } });

  let jawaban: Anthropic.Message;
  try {
    jawaban = await siap.klien.messages.create({
      model: siap.model,
      max_tokens: 1500,
      system: [
        { type: "text", text: promptPanduan(teksPanduan, halaman), cache_control: { type: "ephemeral" } },
        { type: "text", text: promptKonteks({ nama: event.name, status: event.status }, auth.scope.role) },
      ],
      messages: [{ role: "user", content: masukan.data.pertanyaan }],
      output_config: { effort: "low", format: { type: "json_schema", schema: SKEMA_TANYA as unknown as Record<string, unknown> } },
    });
  } catch (error) {
    await catat(0, 0, "failed", { galat: error instanceof Anthropic.APIError ? error.status ?? "api" : "jaringan" });
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return apiError("VALIDATION_ERROR", 422, { message: "The AI key was refused. The Tally owner can replace it in AI settings." });
    }
    if (error instanceof Anthropic.RateLimitError) return apiError("VALIDATION_ERROR", 422, { message: "The AI service is busy. Wait a minute, then ask again." });
    return apiError("INTERNAL_ERROR", 502, { message: "The AI service did not answer. Ask again." });
  }

  const tokenMasuk = tokenMasukSetara(jawaban.usage);
  const tokenKeluar = jawaban.usage.output_tokens;
  const teks = jawaban.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let hasil: JawabanTanya;
  try {
    hasil = saringJawaban(JSON.parse(teks) as JawabanTanya, halaman);
  } catch {
    await catat(tokenMasuk, tokenKeluar, "failed", { galat: jawaban.stop_reason ?? "json" });
    return apiError("VALIDATION_ERROR", 422, { message: "The answer could not be read. Ask again." });
  }
  if (!hasil.jawaban) {
    await catat(tokenMasuk, tokenKeluar, "failed", { galat: "kosong" });
    return apiError("VALIDATION_ERROR", 422, { message: "The answer could not be read. Ask again." });
  }
  await catat(tokenMasuk, tokenKeluar, "saved", { tautan: hasil.tautan.map((t) => t.href) });
  return Response.json({ jawaban: hasil });
}
