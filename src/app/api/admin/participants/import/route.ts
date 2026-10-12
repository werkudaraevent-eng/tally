import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { importHeaders, importableFields, mapRows, parseCsv, parseXlsx } from "@/lib/participants-io";
import { validateAnswers } from "@/lib/registration-fields";
import { normalizeSeatLabel } from "@/lib/seat-map";
import { applyImportSeats, loadSeatLabels, loadTallySeatSessions } from "@/lib/seat-tally";
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
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", 422, { message: "No file selected." });
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
  const { rows: semua, recognized, seats: kursiBerkas } = mapRows(matrix, fields);
  // Kolom nama diperiksa DI SINI, bukan dibiarkan jadi 5.000 penolakan
  // per-baris di dalam RPC. Berkas yang headernya salah menghasilkan galat yang
  // identik untuk setiap baris, dan daftar itu tidak memberi tahu apa pun yang
  // tidak sudah dijawab oleh satu kalimat tentang headernya.
  // qr_code tidak wajib: baris tanpa kode mendapat kode REG dari RPC.
  if (!recognized.includes("name")) {
    return apiError("VALIDATION_ERROR", 422, {
      message: `Column name not found in the first row of the file. Recognised columns: ${importHeaders(fields).join(", ")}.`,
    });
  }
  if (semua.length === 0) return apiError("IMPORT_EMPTY", 422);

  // Nomor baris dihitung dari `semua` (baris kosong sudah dibuang oleh
  // mapRows). RPC hanya menerima baris yang lolos di sini dan menomori ulang
  // dari 1, jadi `asal` memetakan nomor baris RPC kembali ke nomor baris
  // berkas. Tanpa itu, satu jawaban yang ditolak di sini menggeser nomor semua
  // masalah dari RPC sesudahnya.
  // Kolom kursi hanya bisa dipetakan bila tepat SATU sesi denah memakai sumber
  // "Set in Tally"; dengan dua sesi, satu kolom tidak bisa tahu sesi mana.
  const adaKursi = kursiBerkas.some(Boolean);
  const sesiKursi = adaKursi ? await loadTallySeatSessions(auth.scope.event.id) : [];
  if (adaKursi && sesiKursi.length !== 1) {
    return apiError("VALIDATION_ERROR", 422, {
      message: sesiKursi.length === 0
        ? "The file has a seat column, but no seating session takes seats from Tally. In Seating plan › This session, set Seat source to Set in Tally, or remove the column."
        : "The file has a seat column, but more than one seating session takes seats from Tally, so the seats can't be matched to a session. Set the seats in each participant's Edit panel instead.",
    });
  }
  const labelSah = adaKursi ? await loadSeatLabels(auth.scope.event.id) : new Map<string, string>();
  const kursiDiminta: Array<{ qr_code: string; label: string }> = [];
  const barisKursi = new Map<string, number>();

  const tambahan = importableFields(fields);
  const ditolak: ImportIssue[] = [];
  const asal: number[] = [];
  const rows = semua.filter((row, index) => {
    if (row.extra) {
      const { issues, clean } = validateAnswers(tambahan, row.extra, { enforceRequired: false });
      if (issues.length > 0) {
        ditolak.push({ row: index + 1, qr_code: row.qr_code ?? null, reason: issues.map((issue) => issue.message).join(" ") });
        return false;
      }
      row.extra = clean;
    }
    const ketik = kursiBerkas[index] ?? "";
    if (ketik) {
      const label = labelSah.get(normalizeSeatLabel(ketik));
      const tolak = (reason: string) => { ditolak.push({ row: index + 1, qr_code: row.qr_code ?? null, reason }); return false; };
      if (!row.qr_code) return tolak("Add a QR code to this row to set its seat.");
      if (!label) return tolak(`Seat ${ketik} isn't on the Seating plan.`);
      const dipakai = barisKursi.get(normalizeSeatLabel(label));
      if (dipakai) return tolak(`Seat ${label} is also used in row ${dipakai}.`);
      barisKursi.set(normalizeSeatLabel(label), index + 1);
      kursiDiminta.push({ qr_code: row.qr_code, label });
    }
    asal.push(index + 1);
    return true;
  });

  if (rows.length === 0) {
    return Response.json({
      dry_run: dryRun, rows: semua.length, inserted: 0, updated: 0, generated: 0, unchecked: 0, source_locked: 0,
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
    if (code === "REGISTRATION_QR_EXHAUSTED") {
      return apiError(code, 422, { message: "Could not create a new QR code for this event. Add QR codes to the rows without one and import again." });
    }
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  // Penolakan dari pemeriksaan jawaban digabung dengan penolakan dari RPC,
  // supaya pratinjau menampilkan SATU daftar masalah dengan satu hitungan.
  const hasil = data as { rows: number; generated?: number; unchecked?: number; rejected: number; issues: ImportIssue[]; issues_truncated: boolean };
  const dariRpc = hasil.issues.map((issue) => ({ ...issue, row: asal[issue.row - 1] ?? issue.row }));
  const issues = [...ditolak, ...dariRpc].sort((a, b) => a.row - b.row);

  // Baris yang ditolak RPC tidak ikut mendapat kursi.
  const ditolakRpc = new Set(hasil.issues.map((issue) => issue.qr_code).filter(Boolean));
  const kursiBerlaku = kursiDiminta.filter((item) => !ditolakRpc.has(item.qr_code));
  let kursi: { set: number; freed: number; scanner: number } | null = null;
  if (sesiKursi.length === 1 && kursiBerlaku.length > 0) {
    try {
      kursi = await applyImportSeats(auth.scope.event.id, sesiKursi[0], kursiBerlaku, { dryRun, actor: auth.user.id });
    } catch {
      return apiError("INTERNAL_ERROR", 500, { message: "Participants were imported, but their seats weren't saved. Import the same file again to set the seats." });
    }
  }

  return Response.json({
    ...hasil,
    ...(kursi ? { seats_set: kursi.set, seats_freed: kursi.freed, seats_scanner: kursi.scanner, seat_session: sesiKursi[0].name } : {}),
    // Fungsi lama (sebelum 202610120001) tidak mengirim kedua kunci ini.
    generated: hasil.generated ?? 0,
    unchecked: hasil.unchecked ?? 0,
    rows: hasil.rows + ditolak.length,
    rejected: hasil.rejected + ditolak.length,
    issues: issues.slice(0, 50),
    issues_truncated: hasil.issues_truncated || issues.length > 50,
    recognized_columns: recognized,
    file_name: file.name,
  });
}
