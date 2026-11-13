import type Anthropic from "@anthropic-ai/sdk";
import { selKeTsv } from "@/lib/ai/logistik-kamar";
import { textToCells, xlsxToCells } from "@/lib/undian-import";

/**
 * Berkas unggahan menjadi isi pesan untuk AI, dipakai semua fitur "Read with
 * AI". Jenis dari ekstensi, seperti impor biasa. Spreadsheet dikirim sebagai
 * teks bertab; PDF dan foto apa adanya. Isi berkas tidak disimpan.
 */

// Vercel menolak badan permintaan di atas 4,5 MB sebelum route berjalan; browser
// sudah mengecilkan foto dan menahan di 4 MB (kecilkan-berkas.ts).
export const BATAS_TOTAL = 4.5 * 1024 * 1024;
export const BATAS_JUMLAH = 10;
const BATAS_BARIS_TEKS = 3000;

const GAMBAR: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

/** Berkas dari formulir, dengan batas jumlah dan ukuran. String = pesan galat untuk admin. */
export function ambilBerkas(form: FormData | null): File[] | string {
  const berkas = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (berkas.length === 0) return "Choose at least one file.";
  if (berkas.length > BATAS_JUMLAH) return `Choose at most ${BATAS_JUMLAH} files at a time.`;
  if (berkas.reduce((n, f) => n + f.size, 0) > BATAS_TOTAL) return "These files are more than 4 MB together. Send fewer at a time.";
  return berkas;
}

/** Isi pesan untuk AI dari berkas. String = pesan galat untuk admin. */
export async function berkasKeIsi(berkas: File[]): Promise<Anthropic.ContentBlockParam[] | string> {
  const isi: Anthropic.ContentBlockParam[] = [];
  for (const file of berkas) {
    const nama = file.name.slice(0, 200);
    const ext = nama.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") {
      isi.push({ type: "text", text: `File: ${nama}` });
      isi.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
    } else if (GAMBAR[ext]) {
      isi.push({ type: "text", text: `File: ${nama}` });
      isi.push({ type: "image", source: { type: "base64", media_type: GAMBAR[ext], data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
    } else if (ext === "heic" || ext === "heif") {
      return `${nama} is an iPhone HEIC photo. Send it as JPG (on iPhone: share it, or take a screenshot).`;
    } else if (["xlsx", "xlsm", "csv", "tsv", "txt"].includes(ext)) {
      const sel = ext === "xlsx" || ext === "xlsm" ? await xlsxToCells(await file.arrayBuffer()) : textToCells(await file.text());
      if (!sel) return `${nama} could not be read. Check that it is not damaged or password-protected.`;
      if (sel.length > BATAS_BARIS_TEKS) return `${nama} has more than ${BATAS_BARIS_TEKS} rows. Split it into smaller files.`;
      isi.push({ type: "text", text: `File: ${nama} (spreadsheet, tab-separated)\n${selKeTsv(sel)}` });
    } else if (ext === "xls") {
      return `${nama} is the old .xls format. Open it in Excel, then Save As .xlsx.`;
    } else {
      return `${nama} is not a supported file. Use Excel, CSV, PDF, JPG, PNG or a chat export (.txt).`;
    }
  }
  return isi;
}

/** Kode galat API AI (untuk ai_runs.detail) dan pesan untuk admin. */
export function galatAi(error: unknown, Galat: typeof Anthropic): { kode: string | number; pesan: string; status: 422 | 502 } {
  const kode = error instanceof Galat.APIError ? error.status ?? "api" : "jaringan";
  if (error instanceof Galat.AuthenticationError || error instanceof Galat.PermissionDeniedError) {
    return { kode, status: 422, pesan: "The AI key was refused. The Tally owner can replace it in AI settings." };
  }
  if (error instanceof Galat.RateLimitError) return { kode, status: 422, pesan: "The AI service is busy. Wait a minute, then try again." };
  if (error instanceof Galat.BadRequestError) return { kode, status: 422, pesan: "The AI could not open one of these files. Try a clearer photo, or export the file again." };
  return { kode, status: 502, pesan: "The AI service did not answer. Try again." };
}
