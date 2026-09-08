import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { importHeaders, importableFields, mapRows, parseCsv, parseXlsx } from "@/lib/participants-io";
import { validateAnswers } from "@/lib/registration-fields";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/** 4 MB. 5.000 baris peserta jauh di bawah ini; berkas yang lebih besar
 *  hampir pasti memuat gambar atau sheet lain yang tidak akan dibaca. */
const MAX_BYTES = 4 * 1024 * 1024;

type ImportIssue = { row: number; qr_code: string | null; reason: string };

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
 *
 * Jawaban pertanyaan tambahan diperiksa DI SINI terhadap konfigurasi form,
 * sebelum sampai ke RPC: fungsi database tidak tahu pilihan mana yang sah untuk
 * dropdown "ukuran kaus". Baris yang jawabannya tidak sah ditolak utuh, dengan
 * alasan yang menyebut kolomnya — sama seperti penolakan lain di pratinjau.
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

  const fields = ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
  const { rows: semua, recognized } = mapRows(matrix, fields);
  // Dua kolom wajib diperiksa DI SINI, bukan dibiarkan jadi 5.000 penolakan
  // per-baris di dalam RPC. Berkas yang headernya salah menghasilkan galat yang
  // identik untuk setiap baris, dan daftar itu tidak memberi tahu apa pun yang
  // tidak sudah dijawab oleh satu kalimat tentang headernya.
  const missing = (["qr_code", "name"] as const).filter((field) => !recognized.includes(field));
  if (missing.length > 0) {
    return apiError("VALIDATION_ERROR", 422, {
      message: `Kolom ${missing.join(" dan ")} tidak ditemukan di baris pertama berkas. Kolom yang dikenali: ${importHeaders(fields).join(", ")}.`,
    });
  }
  if (semua.length === 0) return apiError("IMPORT_EMPTY", 422);

  // Nomor baris dihitung dari berkas yang sama dengan RPC (baris kosong sudah
  // dibuang oleh mapRows), jadi angka di daftar masalah tetap sepadan antara
  // penolakan di sini dan penolakan di dalam fungsi.
  const tambahan = importableFields(fields);
  const ditolak: ImportIssue[] = [];
  const rows = semua.filter((row, index) => {
    if (!row.extra) return true;
    const { issues, clean } = validateAnswers(tambahan, row.extra, { enforceRequired: false });
    if (issues.length > 0) {
      ditolak.push({ row: index + 1, qr_code: row.qr_code ?? null, reason: issues.map((issue) => issue.message).join(" ") });
      return false;
    }
    row.extra = clean;
    return true;
  });

  if (rows.length === 0) {
    return Response.json({
      dry_run: dryRun, rows: semua.length, inserted: 0, updated: 0, source_locked: 0,
      rejected: ditolak.length, issues: ditolak.slice(0, 50), issues_truncated: ditolak.length > 50,
      recognized_columns: recognized, file_name: file.name,
    });
  }

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

  // Penolakan dari pemeriksaan jawaban digabung dengan penolakan dari RPC,
  // supaya pratinjau menampilkan SATU daftar masalah dengan satu hitungan.
  const hasil = data as { rows: number; rejected: number; issues: ImportIssue[]; issues_truncated: boolean };
  const issues = [...ditolak, ...hasil.issues].sort((a, b) => a.row - b.row);
  return Response.json({
    ...hasil,
    rows: hasil.rows + ditolak.length,
    rejected: hasil.rejected + ditolak.length,
    issues: issues.slice(0, 50),
    issues_truncated: hasil.issues_truncated || issues.length > 50,
    recognized_columns: recognized,
    file_name: file.name,
  });
}
