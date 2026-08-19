import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { votePercentages, type VoteType, type VoterMode } from "@/lib/vote";

// Ekspor hasil voting, dipakai bersama endpoint CSV dan XLSX.
//
// Satu modul supaya kedua format berisi angka yang sama persis. Kalau
// masing-masing menyusun barisnya sendiri, keduanya akan pelan-pelan berbeda dan
// hasil rekonsiliasi bergantung pada format mana yang kebetulan diunduh — cacat
// yang sama sudah dihindari di `export-orders` dan `participants-io`.

export type VoteExportFormat = "csv" | "xlsx";

type PollRow = {
  id: number;
  question: string;
  type: VoteType;
  voter_mode: VoterMode;
  rating_max: number;
  status: string;
  vote_options: Array<{ id: number; label: string; vote_count: number; sort_order: number }>;
};

type BallotRow = {
  id: number;
  created_at: string;
  display_name: string | null;
  participant_id: string | null;
  rating_value: number | null;
  text_value: string | null;
  text_status: string;
  vote_ballot_choices: Array<{ option_id: number }>;
};

export type VoteExport = {
  question: string;
  type: VoteType;
  /** Judul + baris rekap. Bentuknya berbeda per tipe pertanyaan. */
  summary: { headers: string[]; rows: unknown[][] };
  /** Satu baris per pemilih. Kosong bila belum ada suara. */
  detail: { headers: string[]; rows: unknown[][] };
};

export async function loadVoteExport(eventId: string, pollId: number): Promise<VoteExport | null> {
  const client = getSupabaseServiceClient();

  const { data: pollData } = await client
    .from("vote_polls")
    .select("id,question,type,voter_mode,rating_max,status,vote_options(id,label,vote_count,sort_order)")
    .eq("id", pollId).eq("event_id", eventId).maybeSingle();
  if (!pollData) return null;
  const poll = pollData as unknown as PollRow;

  const { data: ballotData } = await client
    .from("vote_ballots")
    .select("id,created_at,display_name,participant_id,rating_value,text_value,text_status,vote_ballot_choices(option_id)")
    .eq("poll_id", pollId).eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const ballots = (ballotData ?? []) as unknown as BallotRow[];

  const options = [...poll.vote_options].sort((a, b) => a.sort_order - b.sort_order);
  const labelById = new Map(options.map((option) => [option.id, option.label]));

  // Waktu dikirim apa adanya dalam ISO, bukan diformat ke zona acara.
  // Spreadsheet memperlakukan ISO sebagai tanggal yang dapat diurutkan dan
  // difilter; teks berformat lokal hanya dapat diurutkan menurut abjad, dan
  // "10 Agustus" akan berada sebelum "9 Agustus".
  const waktu = (value: string) => value;

  if (poll.type === "rating") {
    const buckets = Array.from({ length: poll.rating_max }, (_, index) => index + 1)
      .map((value) => ({ value, count: ballots.filter((ballot) => ballot.rating_value === value).length }));
    const total = ballots.length;
    const jumlah = ballots.reduce((sum, ballot) => sum + (ballot.rating_value ?? 0), 0);
    const percentages = votePercentages(buckets.map((bucket) => bucket.count));

    return {
      question: poll.question,
      type: poll.type,
      summary: {
        headers: ["nilai", "jumlah_suara", "persen"],
        rows: [
          ...buckets.map((bucket, index) => [bucket.value, bucket.count, percentages[index]]),
          // Baris agregat ditaruh di BAWAH sebaran, dipisah label. Ditaruh di
          // atas, ia ikut terbawa saat orang menyortir kolom nilai.
          ["rata-rata", total > 0 ? Number((jumlah / total).toFixed(2)) : 0, ""],
          ["total pemilih", total, ""],
        ],
      },
      detail: {
        headers: ["waktu", "pemilih", "nilai", "participant_id"],
        rows: ballots.map((ballot) => [waktu(ballot.created_at), ballot.display_name ?? "", ballot.rating_value ?? "", ballot.participant_id ?? ""]),
      },
    };
  }

  if (poll.type === "wordcloud") {
    // HANYA kata yang disetujui yang masuk rekap — itulah yang tampil di layar.
    // Yang ditolak tetap ada di lembar detail beserta statusnya, karena catatan
    // moderasi justru bagian yang paling perlu dapat ditelusuri kembali.
    const counts = new Map<string, number>();
    for (const ballot of ballots) {
      if (ballot.text_status !== "approved" || !ballot.text_value) continue;
      for (const word of ballot.text_value.split(" ").filter(Boolean)) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    return {
      question: poll.question,
      type: poll.type,
      summary: {
        headers: ["kata", "jumlah"],
        rows: sorted.map(([word, count]) => [word, count]),
      },
      detail: {
        headers: ["waktu", "pemilih", "kata", "status_moderasi", "participant_id"],
        rows: ballots.map((ballot) => [
          waktu(ballot.created_at), ballot.display_name ?? "", ballot.text_value ?? "",
          ballot.text_status, ballot.participant_id ?? "",
        ]),
      },
    };
  }

  // Pilihan tunggal & ganda.
  const percentages = votePercentages(options.map((option) => option.vote_count));
  return {
    question: poll.question,
    type: poll.type,
    summary: {
      headers: ["opsi", "jumlah_suara", "persen"],
      rows: [
        ...options.map((option, index) => [option.label, option.vote_count, percentages[index]]),
        ["total pemilih", ballots.length, ""],
      ],
    },
    detail: {
      headers: ["waktu", "pemilih", "pilihan", "participant_id"],
      rows: ballots.map((ballot) => [
        waktu(ballot.created_at),
        ballot.display_name ?? "",
        // Pilihan ganda digabung dengan " + " dalam SATU sel, bukan dipecah jadi
        // beberapa baris: satu baris per suara menjaga jumlah baris tetap sama
        // dengan jumlah pemilih, dan itu yang dihitung orang saat membukanya.
        ballot.vote_ballot_choices.map((choice) => labelById.get(choice.option_id) ?? `#${choice.option_id}`).join(" + "),
        ballot.participant_id ?? "",
      ]),
    },
  };
}

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * CSV berisi REKAP saja.
 *
 * Satu berkas CSV hanya bisa memuat satu tabel; menempelkan detail di bawah
 * rekap menghasilkan dua kumpulan kolom yang tidak sejajar, dan spreadsheet
 * mana pun akan salah membacanya. Detail per pemilih tersedia di XLSX, yang
 * memang punya lembar terpisah.
 */
export function buildVoteCsv(data: VoteExport) {
  const lines = [data.summary.headers.join(",")];
  for (const row of data.summary.rows) lines.push(row.map(escapeCsv).join(","));
  // BOM di depan: tanpa itu Excel di Windows membaca berkas sebagai ANSI dan
  // huruf beraksen tampil rusak.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function buildVoteXlsx(data: VoteExport) {
  // Diimpor di dalam fungsi supaya pustaka hanya dimuat ketika XLSX benar-benar
  // diminta; unduhan CSV tetap ringan.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  const ringkasan = workbook.addWorksheet("Ringkasan");
  ringkasan.addRow([data.question]);
  ringkasan.getRow(1).font = { bold: true, size: 14 };
  ringkasan.addRow([]);
  ringkasan.addRow([...data.summary.headers]);
  ringkasan.getRow(3).font = { bold: true };
  for (const row of data.summary.rows) ringkasan.addRow(row);
  ringkasan.columns.forEach((column) => { column.width = 24; });

  const detail = workbook.addWorksheet("Detail");
  detail.addRow([...data.detail.headers]);
  detail.getRow(1).font = { bold: true };
  // Baris judul dibekukan: daftar pemilih bisa ratusan baris, dan tanpa ini
  // nama kolom hilang begitu digulir.
  detail.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of data.detail.rows) detail.addRow(row);
  detail.columns.forEach((column) => { column.width = 26; });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Nama berkas: slug acara + potongan pertanyaan, supaya beberapa unduhan tidak
 *  saling tertukar di folder Unduhan. */
export function voteExportFilename(format: VoteExportFormat, eventSlug: string, question: string) {
  const potongan = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "voting";
  return `voting-${eventSlug}-${potongan}.${format}`;
}

export const VOTE_CONTENT_TYPES: Record<VoteExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
