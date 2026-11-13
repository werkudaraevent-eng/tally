import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { ambilBerkas, berkasKeIsi, galatAi } from "@/lib/ai/berkas";
import { kolomImporAi, promptSistem, rapikanBaris, selKeCsv, skemaKeluaran } from "@/lib/ai/peserta-impor";
import { biayaUsd, modelAi } from "@/lib/ai/model";
import { akhiriRun, catatRun, siapkanFitur } from "@/lib/ai/server";

/**
 * Participant list > Import > "Read with AI".
 *
 * GET: apakah tombolnya bisa dipakai di acara ini (kunci ada, fitur menyala,
 * batas bulanan belum habis).
 *
 * POST (multipart, `file` boleh berulang): daftar peserta dari panitia dalam
 * bentuk apa pun dibaca AI menjadi kolom template impor peserta, lalu
 * `rapikanBaris` mengosongkan jawaban yang tidak sah. Balasannya berkas CSV
 * yang dimasukkan dialog ke Import peserta biasa: pratinjau dulu, Apply
 * ditekan admin. Route ini TIDAK menulis peserta. Yang ditulis hanya satu
 * baris `ai_runs` (token, biaya, nama berkas; isi berkas tidak disimpan).
 *
 * AI menerima kolom dan pilihan form acara ini, bukan daftar peserta yang
 * sudah ada. Isi berkas (nama, kontak) memang dikirim ke penyedia AI untuk
 * dibaca; itu sebabnya fiturnya dinyalakan pemilik di Settings > AI.
 *
 * PATCH { run_id, status: "closed" }: dialog ditutup tanpa Apply. "saved"
 * dicatat oleh route impor saat Apply.
 *
 * Admin acara saja, sama dengan Import peserta.
 */

export const maxDuration = 300;

const FITUR = "peserta_impor";

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

  const fields = ((event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
  const kolom = kolomImporAi(fields);
  isi.push({ type: "text", text: "Copy every person in these files into the columns." });

  const namaBerkas = berkas.map((f) => f.name);
  const catat = (tokenMasuk: number, tokenKeluar: number, status: "preview" | "failed", detail: Record<string, unknown>) =>
    catatRun({ eventId: event.id, userId: auth.user.id, fitur: FITUR, model: siap.model, berkas: namaBerkas, tokenMasuk, tokenKeluar, status, detail });

  let jawaban: Anthropic.Message;
  try {
    jawaban = await siap.klien.messages.stream({
      model: siap.model,
      max_tokens: 64000,
      system: promptSistem(kolom),
      messages: [{ role: "user", content: isi }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: skemaKeluaran(kolom) as unknown as Record<string, unknown> } },
    }).finalMessage();
  } catch (error) {
    const g = galatAi(error, Anthropic);
    await catat(0, 0, "failed", { galat: g.kode });
    return apiError(g.status === 502 ? "INTERNAL_ERROR" : "VALIDATION_ERROR", g.status, { message: g.pesan });
  }

  const tokenMasuk = jawaban.usage.input_tokens + (jawaban.usage.cache_read_input_tokens ?? 0) + (jawaban.usage.cache_creation_input_tokens ?? 0);
  const tokenKeluar = jawaban.usage.output_tokens;
  const gagal = async (alasan: string, pesan: string) => {
    await catat(tokenMasuk, tokenKeluar, "failed", { galat: alasan });
    return apiError("VALIDATION_ERROR", 422, { message: pesan });
  };
  if (jawaban.stop_reason === "refusal") return gagal("refusal", "The AI declined to read these files. Try the normal import with the template.");
  if (jawaban.stop_reason === "max_tokens") return gagal("max_tokens", "These files have too many people for one go. Send fewer files or pages at a time.");

  const teks = jawaban.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const Keluaran = z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(6000), notes: z.array(z.string()).max(30) });
  let keluaran: z.infer<typeof Keluaran>;
  try {
    const hasil = Keluaran.safeParse(JSON.parse(teks));
    if (!hasil.success) return gagal("skema", "The AI answer could not be read. Try again.");
    keluaran = hasil.data;
  } catch {
    return gagal("json", "The AI answer could not be read. Try again.");
  }

  const rapi = rapikanBaris(kolom, keluaran.rows);
  if (rapi.orang === 0) return gagal("kosong", "The AI found no people with a name in these files.");
  const runId = await catat(tokenMasuk, tokenKeluar, "preview", { orang: rapi.orang, tanpa_nama: rapi.tanpaNama, dikosongkan: rapi.dikosongkan.reduce((n, d) => n + d.jumlah, 0) });

  return Response.json({
    run_id: runId,
    model: modelAi(siap.model)?.label ?? siap.model,
    biaya_usd: biayaUsd(siap.model, tokenMasuk, tokenKeluar),
    orang: rapi.orang,
    tanpa_nama: rapi.tanpaNama,
    dikosongkan: rapi.dikosongkan,
    catatan: keluaran.notes.slice(0, 8).map((c) => c.slice(0, 300)),
    berkas: selKeCsv(rapi.sel),
  });
}

const akhirSchema = z.object({ run_id: z.number().int().positive(), status: z.literal("closed") });

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = akhirSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const ok = await akhiriRun(parsed.data.run_id, auth.scope.event.id, parsed.data.status);
  return ok ? Response.json({ ok: true }) : apiError("INTERNAL_ERROR", 500);
}
