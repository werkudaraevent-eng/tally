import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isiNomorKamar, promptSistem, selKeTsv, SKEMA_KELUARAN, type KeluaranAi } from "@/lib/ai/logistik-kamar";
import { biayaUsd, modelAi } from "@/lib/ai/model";
import { akhiriRun, catatRun, siapkanFitur } from "@/lib/ai/server";
import { klien, muatStaySekarang, semuaBaris } from "@/lib/logistik/server";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";
import { textToCells, xlsxToCells } from "@/lib/undian-import";

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
const BATAS_BERKAS = 10 * 1024 * 1024;
const BATAS_GAMBAR = 5 * 1024 * 1024;
const BATAS_TOTAL = 20 * 1024 * 1024;
const BATAS_JUMLAH = 10;
const BATAS_BARIS_TEKS = 3000;

const GAMBAR: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

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

  const form = await request.formData().catch(() => null);
  const berkas = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (berkas.length === 0) return apiError("VALIDATION_ERROR", 422, { message: "Choose at least one file." });
  if (berkas.length > BATAS_JUMLAH) return apiError("VALIDATION_ERROR", 422, { message: `Choose at most ${BATAS_JUMLAH} files at a time.` });
  if (berkas.reduce((n, f) => n + f.size, 0) > BATAS_TOTAL) return apiError("VALIDATION_ERROR", 422, { message: "These files are more than 20 MB together. Send fewer at a time." });

  const siap = await siapkanFitur(FITUR);
  if (!siap.siap) return apiError("VALIDATION_ERROR", 422, { message: siap.pesan });

  // Isi berkas untuk AI. Jenis dari ekstensi, seperti impor biasa.
  const isi: Anthropic.ContentBlockParam[] = [];
  for (const file of berkas) {
    const nama = file.name.slice(0, 200);
    const ext = nama.toLowerCase().split(".").pop() ?? "";
    if (file.size > BATAS_BERKAS) return apiError("VALIDATION_ERROR", 422, { message: `${nama} is larger than 10 MB.` });
    if (ext === "pdf") {
      isi.push({ type: "text", text: `File: ${nama}` });
      isi.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
    } else if (GAMBAR[ext]) {
      if (file.size > BATAS_GAMBAR) return apiError("VALIDATION_ERROR", 422, { message: `${nama} is larger than 5 MB. Send a smaller photo or a screenshot.` });
      isi.push({ type: "text", text: `File: ${nama}` });
      isi.push({ type: "image", source: { type: "base64", media_type: GAMBAR[ext], data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
    } else if (ext === "heic" || ext === "heif") {
      return apiError("VALIDATION_ERROR", 422, { message: `${nama} is an iPhone HEIC photo. Send it as JPG (on iPhone: share it, or take a screenshot).` });
    } else if (["xlsx", "xlsm", "csv", "tsv", "txt"].includes(ext)) {
      const sel = ext === "xlsx" || ext === "xlsm" ? await xlsxToCells(await file.arrayBuffer()) : textToCells(await file.text());
      if (!sel) return apiError("VALIDATION_ERROR", 422, { message: `${nama} could not be read. Check that it is not damaged or password-protected.` });
      if (sel.length > BATAS_BARIS_TEKS) return apiError("VALIDATION_ERROR", 422, { message: `${nama} has more than ${BATAS_BARIS_TEKS} rows. Split it into smaller files.` });
      isi.push({ type: "text", text: `File: ${nama} (spreadsheet, tab-separated)\n${selKeTsv(sel)}` });
    } else if (ext === "xls") {
      return apiError("VALIDATION_ERROR", 422, { message: `${nama} is the old .xls format. Open it in Excel, then Save As .xlsx.` });
    } else {
      return apiError("VALIDATION_ERROR", 422, { message: `${nama} is not a supported file. Use Excel, CSV, PDF, JPG, PNG or a chat export (.txt).` });
    }
  }

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
