import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isiNomorKamar, promptSistem, selKeTsv, SKEMA_KELUARAN, type KeluaranAi } from "@/lib/ai/logistik-kamar";
import { biayaUsd, modelAi } from "@/lib/ai/model";
import { ambilBerkas, berkasKeIsi } from "@/lib/ai/berkas";
import { akhiriRun, catatRun, siapkanFitur } from "@/lib/ai/server";
import { klien, muatStaySekarang, semuaBaris } from "@/lib/logistik/server";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Logistics > Import > "Read a hotel file with AI".
 *
 * GET: apakah tombolnya bisa dipakai di acara ini (kunci ada, fitur menyala,
 * batas bulanan belum habis), supaya dialog tidak menawarkan tombol yang pasti
 * ditolak.
 *
 * POST (multipart, `file` boleh berulang): berkas dibaca AI menjadi daftar
 * nomor kamar, lalu `isiNomorKamar` mengisinya ke "Download current stays".
 * Balasannya berkas impor (teks bertab) yang dimasukkan dialog ke jalur impor
 * biasa: pratinjau dulu, Save ditekan admin. Route ini TIDAK menulis Logistics.
 * Yang ditulis hanya satu baris `ai_runs` (token, biaya, nama berkas; isi
 * berkas tidak disimpan).
 *
 * PATCH { run_id, status }: hasil akhir pemakaian (disimpan atau ditutup),
 * untuk angka "Results" di halaman AI.
 *
 * Admin acara saja, sama dengan impor Logistics.
 */

export const maxDuration = 300;

const FITUR = "logistik_kamar";

const keluaranSchema = z.object({
  rows: z.array(z.object({
    hotel: z.string(), room_number: z.string(), guest_name: z.string(), check_in: z.string(), check_out: z.string(),
  })).max(5000),
  notes: z.array(z.string()).max(30),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const siap = await siapkanFitur(FITUR);
  if (!siap.siap) return Response.json({ siap: false, alasan: siap.alasan, pesan: siap.pesan });
  return Response.json({ siap: true, model: modelAi(siap.model)?.label ?? siap.model });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const berkas = ambilBerkas(await request.formData().catch(() => null));
  if (typeof berkas === "string") return apiError("VALIDATION_ERROR", 422, { message: berkas });

  const siap = await siapkanFitur(FITUR);
  if (!siap.siap) return apiError("VALIDATION_ERROR", 422, { message: siap.pesan });

  const isi = await berkasKeIsi(berkas);
  if (typeof isi === "string") return apiError("VALIDATION_ERROR", 422, { message: isi });

  const hotels = await semuaBaris<{ name: string }>(() => klien().from("lodging_hotels").select("id,name").eq("event_id", event.id).order("id"));
  if (!hotels) return apiError("INTERNAL_ERROR", 500);
  isi.push({ type: "text", text: "Return the room number of every guest in these files." });

  const namaBerkas = berkas.map((f) => f.name);
  let jawaban: Anthropic.Message;
  try {
    jawaban = await siap.klien.messages.stream({
      model: siap.model,
      max_tokens: 32000,
      system: promptSistem(hotels.map((h) => h.name)),
      messages: [{ role: "user", content: isi }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SKEMA_KELUARAN as unknown as Record<string, unknown> } },
    }).finalMessage();
  } catch (error) {
    await catatRun({ eventId: event.id, userId: auth.user.id, fitur: FITUR, model: siap.model, berkas: namaBerkas, tokenMasuk: 0, tokenKeluar: 0, status: "failed", detail: { galat: error instanceof Anthropic.APIError ? error.status ?? "api" : "jaringan" } });
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return apiError("VALIDATION_ERROR", 422, { message: "The AI key was refused. The Tally owner can replace it in AI settings." });
    }
    if (error instanceof Anthropic.RateLimitError) return apiError("VALIDATION_ERROR", 422, { message: "The AI service is busy. Wait a minute, then try again." });
    if (error instanceof Anthropic.BadRequestError) return apiError("VALIDATION_ERROR", 422, { message: "The AI could not open one of these files. Try a clearer photo, or export the file again." });
    return apiError("INTERNAL_ERROR", 502, { message: "The AI service did not answer. Try again." });
  }

  const tokenMasuk = jawaban.usage.input_tokens + (jawaban.usage.cache_read_input_tokens ?? 0) + (jawaban.usage.cache_creation_input_tokens ?? 0);
  const tokenKeluar = jawaban.usage.output_tokens;
  const gagal = async (alasan: string, pesan: string) => {
    await catatRun({ eventId: event.id, userId: auth.user.id, fitur: FITUR, model: siap.model, berkas: namaBerkas, tokenMasuk, tokenKeluar, status: "failed", detail: { galat: alasan } });
    return apiError("VALIDATION_ERROR", 422, { message: pesan });
  };
  if (jawaban.stop_reason === "refusal") return gagal("refusal", "The AI declined to read these files. Try the normal Excel import.");
  if (jawaban.stop_reason === "max_tokens") return gagal("max_tokens", "These files have too many guests for one go. Send fewer files or pages at a time.");

  const teks = jawaban.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let keluaran: KeluaranAi;
  try {
    const hasil = keluaranSchema.safeParse(JSON.parse(teks));
    if (!hasil.success) return gagal("skema", "The AI answer could not be read. Try again.");
    keluaran = hasil.data;
  } catch {
    return gagal("json", "The AI answer could not be read. Try again.");
  }

  const stays = await muatStaySekarang(event.id, timeZoneOffset(normalizeTimeZone(event.time_zone)));
  if (!stays) return apiError("INTERNAL_ERROR", 500);
  const cocok = isiNomorKamar(stays, keluaran.rows);
  if (!cocok) return apiError("INTERNAL_ERROR", 500);

  const hitung: Record<string, number> = {};
  for (const h of cocok.hasil) hitung[h.status] = (hitung[h.status] ?? 0) + 1;
  const runId = await catatRun({ eventId: event.id, userId: auth.user.id, fitur: FITUR, model: siap.model, berkas: namaBerkas, tokenMasuk, tokenKeluar, status: "preview", detail: { baris: cocok.hasil.length, ...hitung } });

  return Response.json({
    run_id: runId,
    model: modelAi(siap.model)?.label ?? siap.model,
    biaya_usd: biayaUsd(siap.model, tokenMasuk, tokenKeluar),
    hasil: cocok.hasil,
    catatan: keluaran.notes.slice(0, 8),
    // Berkas impor: hanya orang yang nomornya diisi atau berubah. Kosong (hanya judul) = tidak ada yang perlu diimpor.
    berkas: cocok.sel.length > 1 ? selKeTsv(cocok.sel) : null,
  });
}

const akhirSchema = z.object({ run_id: z.number().int().positive(), status: z.enum(["saved", "closed"]) });

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = akhirSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const ok = await akhiriRun(parsed.data.run_id, auth.scope.event.id, parsed.data.status);
  return ok ? Response.json({ ok: true }) : apiError("INTERNAL_ERROR", 500);
}
