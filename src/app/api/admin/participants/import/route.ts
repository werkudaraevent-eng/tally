import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { IMPORT_HEADERS, mapRows, parseCsv, parseXlsx } from "@/lib/participants-io";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/** 4 MB. 5.000 baris peserta jauh di bawah ini; berkas yang lebih besar
 *  hampir pasti memuat gambar atau sheet lain yang tidak akan dibaca. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Impor peserta dari CSV atau XLSX.
 *
 * `dry_run` mengembalikan hitungan yang PERSIS sama dengan penerapannya, karena
 * keduanya menjalankan `import_participants` yang sama dengan satu bendera
 * berbeda. Pratinjau yang dihitung terpisah adalah pratinjau yang suatu saat
 * berbohong -- dan berbohongnya baru ketahuan setelah 300 baris tertimpa.
 *
 * Berkas diurai DI SERVER, bukan di browser. Bukan soal kepercayaan: parser
 * yang sama harus dipakai pratinjau dan penerapan, dan menaruhnya di klien
 * berarti dua parser yang bisa berbeda pendapat tentang berkas yang sama.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { message: "Berkas belum dipilih." });
  if (file.size === 0) return apiError("IMPORT_EMPTY", 422);
  if (file.size > MAX_BYTES) return apiError("IMPORT_TOO_LARGE", 422);

  const dryRun = String(form?.get("dry_run") ?? "") !== "false";
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");

  let matrix: string[][];
  try {
    matrix = isXlsx ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
  } catch {
    return apiError("IMPORT_UNREADABLE", 422);
  }

  const { rows, recognized } = mapRows(matrix);
  // Dua kolom wajib diperiksa DI SINI, bukan dibiarkan jadi 5.000 penolakan
  // per-baris di dalam RPC. Berkas yang headernya salah menghasilkan galat yang
  // identik untuk setiap baris, dan daftar itu tidak memberi tahu apa pun yang
  // tidak sudah dijawab oleh satu kalimat tentang headernya.
  const missing = (["qr_code", "name"] as const).filter((field) => !recognized.includes(field));
  if (missing.length > 0) {
    return apiError("VALIDATION_ERROR", 422, {
      message: `Kolom ${missing.join(" dan ")} tidak ditemukan di baris pertama berkas. Kolom yang dikenali: ${IMPORT_HEADERS.join(", ")}.`,
    });
  }
  if (rows.length === 0) return apiError("IMPORT_EMPTY", 422);

  const { data, error } = await getSupabaseServiceClient().rpc("import_participants" as never, {
    p_event_id: auth.scope.event.id,
    p_rows: rows,
    p_dry_run: dryRun,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  return Response.json({ ...(data as Record<string, unknown>), recognized_columns: recognized, file_name: file.name });
}
