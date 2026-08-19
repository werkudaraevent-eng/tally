import { z } from "zod";

// Bentuk data voting langsung, dipakai bersama route handler, CMS, halaman
// pemilih, dan layar panggung. WAJIB bebas impor server-only: ia ikut terbawa
// ke bundel browser.

export type VoteType = "single" | "multi" | "rating" | "wordcloud";
export type VoterMode = "anonymous" | "participant_code" | "participant_pick" | "name_text";
export type VoteStatus = "draft" | "open" | "closed";

export const VOTE_TYPES: { value: VoteType; label: string; hint: string }[] = [
  { value: "single", label: "Pilihan tunggal", hint: "Peserta memilih satu jawaban." },
  { value: "multi", label: "Pilihan ganda", hint: "Peserta boleh memilih beberapa jawaban, sampai batas yang Anda tentukan." },
  { value: "rating", label: "Skala / rating", hint: "Peserta memberi nilai 1 sampai maksimum yang Anda tentukan. Hasilnya rata-rata dan sebaran." },
  { value: "wordcloud", label: "Word cloud", hint: "Peserta mengetik satu sampai lima kata. Kata yang sering muncul membesar di layar." },
];

/** Tipe yang punya daftar opsi. Rating dan word cloud tidak. */
export const TYPES_WITH_OPTIONS: VoteType[] = ["single", "multi"];

/**
 * Mode identitas, beserta peringatan kekuatannya.
 *
 * `warning` bukan hiasan: keduanya TIDAK sama kuat, dan panitia yang memilih
 * mode anonim untuk voting berhadiah perlu membaca konsekuensinya di layar yang
 * sama dengan tempat ia memilih — bukan menemukannya setelah acara.
 */
export const VOTER_MODES: { value: VoterMode; label: string; hint: string; warning?: string }[] = [
  {
    value: "anonymous",
    label: "Anonim",
    hint: "Pindai QR di layar, langsung pilih. Tanpa identitas apa pun.",
    warning: "Satu suara dikunci per perangkat lewat cookie. Menghapus cookie atau membuka mode samaran memberi suara kedua — jangan dipakai untuk voting yang menentukan hadiah.",
  },
  {
    value: "participant_code",
    label: "Kode peserta",
    hint: "Peserta mengetik kode di badge-nya sebelum memilih.",
    warning: "Terikat baris peserta yang nyata, jadi satu orang satu suara. Orang tanpa badge tidak bisa ikut.",
  },
  {
    value: "participant_pick",
    label: "Pilih nama dari daftar",
    hint: "Peserta mencari lalu memilih namanya sendiri. Tanpa perlu membawa badge.",
    warning: "ATRIBUSI, BUKAN PENGAMAN: siapa pun bisa memilih nama orang lain, dan nama yang sudah dipakai tidak bisa dipakai pemiliknya lagi. Daftar nama juga ikut terbuka ke halaman publik lewat pencarian. Jangan dipakai untuk voting berhadiah.",
  },
  {
    value: "name_text",
    label: "Ketik nama sendiri",
    hint: "Peserta mengetik namanya sebelum memilih. Berguna untuk tahu siapa yang menjawab.",
    warning: "ATRIBUSI, BUKAN PENGAMAN: nama tidak diperiksa sama sekali. Suara ganda dicegah lewat cookie perangkat, sekuat mode anonim.",
  },
];

export const VOTE_STATUS_LABEL: Record<VoteStatus, string> = {
  draft: "Draf",
  open: "Dibuka",
  closed: "Ditutup",
};

export type VoteOption = { id: number; label: string; vote_count: number; image_url: string | null };
export type RatingResult = { average: number | null; distribution: Array<{ value: number; count: number }> };
export type WordResult = { word: string; count: number };

export type VotePoll = {
  id: number;
  question: string;
  description: string | null;
  type: VoteType;
  voter_mode: VoterMode;
  max_choices: number;
  status: VoteStatus;
  results_visible: boolean;
  rating_max: number;
  rating_min_label: string | null;
  rating_max_label: string | null;
  moderation: boolean;
  max_words: number;
  options: VoteOption[];
  ballots: number;
  /** Kata word cloud yang menunggu persetujuan operator. */
  pending_words: number;
};

/** Bentuk yang dikirim `/api/vote/state` ke halaman pemilih dan layar panggung. */
export type PublicVoteState = {
  poll: {
    id: number;
    question: string;
    description: string | null;
    type: VoteType;
    voter_mode: VoterMode;
    max_choices: number;
    status: VoteStatus;
    results_visible: boolean;
    rating_max: number;
    rating_min_label: string | null;
    rating_max_label: string | null;
    max_words: number;
    options: Array<{ id: number; label: string; vote_count: number | null; image_url: string | null }>;
    total_ballots: number | null;
    rating: RatingResult | null;
    words: WordResult[] | null;
  } | null;
};

export const pollBodySchema = z.object({
  question: z.string().trim().min(1).max(300),
  description: z.string().trim().max(500).nullish(),
  type: z.enum(["single", "multi", "rating", "wordcloud"]),
  voter_mode: z.enum(["anonymous", "participant_code", "participant_pick", "name_text"]),
  max_choices: z.number().int().min(1).max(20),
  // Opsi boleh kosong: rating dan word cloud tidak punya. Jumlah minimumnya
  // ditegakkan RPC, yang tahu tipe pertanyaannya — validasi di sini tidak bisa
  // mengetahuinya tanpa menduplikasi aturan yang sama di dua tempat.
  options: z.array(z.object({
    id: z.number().int().positive().nullish(),
    label: z.string().trim().min(1).max(200),
    image_url: z.string().trim().url().max(500).nullish(),
  })).max(30).default([]),
  rating_max: z.number().int().min(2).max(10).default(5),
  rating_min_label: z.string().trim().max(60).nullish(),
  rating_max_label: z.string().trim().max(60).nullish(),
  moderation: z.boolean().default(true),
  max_words: z.number().int().min(1).max(5).default(3),
});

export type PollBody = z.infer<typeof pollBodySchema>;

/**
 * Persentase yang SELALU berjumlah 100.
 *
 * Pembulatan per opsi menghasilkan 33% + 33% + 33% = 99%, dan angka itu terbaca
 * seperti ada suara yang hilang saat dipajang di layar besar. Sisa pembulatan
 * diberikan ke opsi dengan pecahan terbesar — metode sisa terbesar, cara yang
 * sama dipakai pembagian kursi parlemen.
 *
 * Pada pilihan GANDA jumlahnya memang boleh melebihi 100 karena satu orang
 * menyumbang beberapa suara; di sana pembagi yang dipakai adalah total suara,
 * bukan jumlah pemilih, sehingga penjumlahannya tetap 100.
 */
export function votePercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}
