// Bentuk data dan aturan undian.
//
// Dipakai bersama oleh route handler, halaman CMS, halaman kontrol operator, dan
// layar panggung, jadi modul ini WAJIB bebas dari impor server-only (mis. service
// client Supabase): ia ikut terbawa ke bundel browser.
//
// Dua hal sengaja diletakkan di sini, bukan di dalam Postgres:
//
//   1. EVALUATOR SYARAT. Halaman CMS harus bisa menjawab "berapa peserta yang
//      lolos syarat ini" seketika sambil syaratnya diedit. Kalau evaluator ada di
//      SQL dan CMS memakai tiruannya, dua angka itu bisa menyimpang tanpa ada yang
//      tahu — sampai malam acara, ketika kolam ternyata bukan yang disetujui.
//      Satu evaluator, satu jawaban.
//
//   2. PEMILIHAN PEMENANG. Dijalankan di server (route handler), bukan browser,
//      tapi diletakkan di modul ini supaya CMS dapat memakai fungsi bobot yang
//      sama untuk memperlihatkan pratinjau distribusi tiket sebelum acara.

// ---------------------------------------------------------------------------
// Syarat kelayakan
// ---------------------------------------------------------------------------

export type UndianCmp = "gte" | "gt" | "lte" | "lt" | "eq";

/**
 * Pembanding teks.
 *
 * `eq`/`neq` bekerja pada teks utuh setelah dipangkas dan diseragamkan huruf
 * besar-kecilnya; sisanya cocok sebagian. Perbandingan SELALU mengabaikan besar
 * kecil huruf, dan itu keputusan sadar: data perusahaan datang dari pendaftaran
 * mandiri, sehingga "PT Prima", "PT PRIMA", dan "pt prima" adalah perusahaan yang
 * sama bagi manusia. Aturan yang membedakannya akan meloloskan orang yang justru
 * ingin dikecualikan, dan penyebabnya tidak terlihat di layar mana pun.
 *
 * `is_empty` ada karena "peserta tanpa perusahaan" tidak dapat dinyatakan lewat
 * pembanding lain: `eq ''` gagal untuk kolom yang berisi NULL, dan `contains ''`
 * cocok dengan semua orang.
 */
export type UndianTextCmp = "eq" | "neq" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

/** Kolom teks yang bisa dijadikan aturan. */
export type UndianTextVar = "name" | "company" | "job_title" | "qr_code" | "seat_label";

export const TEXT_VAR_LABEL: Record<UndianTextVar, string> = {
  name: "Participant name",
  company: "Company",
  job_title: "Job title",
  qr_code: "QR / badge code",
  seat_label: "Seat number",
};

export const TEXT_CMP_LABEL: Record<UndianTextCmp, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** Pembanding yang tidak butuh nilai pembanding. */
export const TEXT_CMP_WITHOUT_VALUE: UndianTextCmp[] = ["is_empty", "is_not_empty"];

/**
 * Daun syarat.
 *
 * Bentuk pohonnya sama dengan `special_offers.conditions` supaya idiomnya
 * familiar, tapi daftar variabelnya berbeda dan itu disengaja. Penawaran spesial
 * dievaluasi DI DALAM konteks sebuah booth, sehingga punya cakupan "booth ini".
 * Undian tidak punya konteks booth sama sekali — mengizinkan "di booth ini" di
 * sini akan menghasilkan syarat yang tidak punya arti dan diam-diam meloloskan
 * atau menggugurkan semua orang.
 *
 * Pohon yang sama dipakai dua arah: pada `undian_prizes.conditions` memenuhi
 * berarti BOLEH ikut, pada `undian_exclusion_rules.conditions` memenuhi berarti
 * DIKECUALIKAN. Yang membedakan hanyalah tabel penyimpannya, bukan bentuk datanya.
 */
export type UndianConditionLeaf =
  | { var: "total_spend"; cmp: UndianCmp; value: number }
  | { var: "booth_count"; cmp: UndianCmp; value: number }
  | { var: "scan_count"; cmp: UndianCmp; value: number }
  | UndianCheckpointLeaf
  | UndianAnswerLeaf
  | { var: "participant_type"; cmp: "in" | "not_in"; values: string[] }
  | { var: "rsvp_status"; cmp: "in" | "not_in"; values: string[] }
  | UndianCheckInLeaf
  | { var: "has_seat"; is: boolean }
  | UndianTextLeaf
  | UndianInvalidLeaf;

/**
 * Check-in dibaca dari pemindaian aplikasi ini (`attendance_scans`) DAN salinan
 * scanner API lama (`participants.source_checked_in`). `session_id` kosong berarti
 * "sesi mana pun"; terisi berarti hanya pemindaian di sesi itu yang dihitung.
 * Salinan scanner API tidak punya sesi, jadi tidak ikut pada pilihan sesi.
 */
export type UndianCheckInLeaf = { var: "checked_in"; is: boolean; session_id?: number };

/**
 * Checkpoint peserta (Check-in > Checkpoints). Dihitung server dari bukti yang
 * sama dengan kartu checkpoint peserta: pemindaian di sesi checkpoint atau
 * barang yang sudah diserahkan.
 *
 *   * `checkpoint_points`: poin yang sudah dikumpulkan. 0 bila Points mati.
 *   * `checkpoint_goal`: tujuan poin (Check-in > Checkpoints > Points goal)
 *     tercapai. Angkanya tidak disalin ke sini, supaya kartu peserta ("20 poin
 *     lagi untuk masuk undian") dan syarat undian selalu memakai angka yang sama.
 *     Tanpa tujuan, tidak ada yang mencapainya.
 *   * `checkpoints_all`: semua checkpoint selesai. Tanpa checkpoint, tidak ada
 *     yang menyelesaikannya.
 */
export type UndianCheckpointLeaf =
  | { var: "checkpoint_points"; cmp: UndianCmp; value: number }
  | { var: "checkpoint_goal"; is: boolean }
  | { var: "checkpoints_all"; is: boolean };

/**
 * Jawaban pertanyaan tambahan form registrasi (participants.extra, kunci =
 * `key` pertanyaannya). Pertanyaan pilihan (dropdown, pilihan ganda, kotak
 * centang) dicocokkan dengan daftar nilai; sisanya seperti kolom teks. Kotak
 * centang dibaca "Yes"/"No", sama dengan kolom di Participant list.
 *
 * Pertanyaan yang sudah dihapus dari form tidak punya nilai di baris kolam,
 * sehingga syaratnya selalu salah, seperti syarat rusak.
 */
export type UndianAnswerLeaf =
  | { var: "answer"; key: string; cmp: UndianTextCmp; text: string }
  | { var: "answer"; key: string; cmp: "in" | "not_in"; values: string[] };

/** Pertanyaan form yang bisa dipakai sebagai syarat. */
export type UndianAnswerField = { key: string; label: string; type: string; options: string[] };

const ANSWER_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Dropdown, pilihan ganda, dan kotak centang: dicocokkan dengan daftar nilai. */
export function isChoiceAnswer(type: string): boolean {
  return type === "select" || type === "radio" || type === "checkbox";
}

/** Nilai yang bisa dipilih untuk pertanyaan pilihan. */
export function answerChoices(field: Pick<UndianAnswerField, "type" | "options">): string[] {
  return field.type === "checkbox" ? ["Yes", "No"] : field.options;
}

/** Jawaban sebagai teks, sama dengan sel Participant list. "" = kosong. */
export function answerText(type: string, raw: unknown): string {
  if (type === "checkbox") return raw === "true" || raw === true ? "Yes" : "No";
  if (type === "file") return raw ? "File attached" : "";
  return raw === null || raw === undefined ? "" : String(raw).trim();
}

/** Ringkasan checkpoint acara untuk teks bantuan di rule builder. */
export type CheckpointSummary = {
  enabled: boolean;
  points_enabled: boolean;
  /** Tujuan poin; null bila belum diatur. */
  goal: number | null;
  count: number;
  total_points: number;
};

export type UndianTextLeaf = { var: UndianTextVar; cmp: UndianTextCmp; text: string };

/**
 * Daun penanda syarat yang tidak dapat dibaca. SELALU bernilai salah.
 *
 * Ada karena dua keputusan yang masing-masing benar ternyata berbahaya bila
 * digabung:
 *
 *   1. Syarat rusak tidak boleh melempar error. Satu baris salah bentuk tidak
 *      boleh mematikan tombol undi di atas panggung.
 *   2. Grup KOSONG harus bernilai benar. Hadiah tanpa syarat memang terbuka untuk
 *      semua peserta.
 *
 * Kalau syarat rusak DIJATUHKAN, pohon yang seluruh isinya rusak berubah menjadi
 * grup kosong, lalu aturan (2) membuatnya bernilai benar untuk semua orang. Pada
 * syarat hadiah itu diam-diam membuka undian untuk seluruh ruangan; pada aturan
 * pengecualian — di mana benar berarti TERSINGKIR — itu menggugurkan semua orang
 * dan kolamnya menjadi nol tanpa satu pun petunjuk di layar.
 *
 * Karena itu syarat rusak DIGANTI, bukan dijatuhkan. Pohonnya tetap berisi
 * sesuatu, sehingga "tidak ada syarat" tetap dapat dibedakan dari "syaratnya tidak
 * terbaca", dan keduanya berperilaku sesuai maksudnya masing-masing.
 */
export type UndianInvalidLeaf = { var: "__invalid" };

export const INVALID_LEAF: UndianInvalidLeaf = { var: "__invalid" };

export type UndianConditionGroup = { op: "and" | "or"; children: UndianConditionNode[] };
export type UndianConditionNode = UndianConditionLeaf | UndianConditionGroup;

export const EMPTY_CONDITIONS: UndianConditionGroup = { op: "and", children: [] };

export function isConditionGroup(node: UndianConditionNode): node is UndianConditionGroup {
  return "op" in node;
}

const TEXT_VARS: UndianTextVar[] = ["name", "company", "job_title", "qr_code", "seat_label"];

export function isTextVar(value: unknown): value is UndianTextVar {
  return TEXT_VARS.includes(value as UndianTextVar);
}

/**
 * Penyempit untuk NODE, bukan untuk nilai `var`-nya.
 *
 * `isTextVar(node.var)` menyempitkan properti saja, sehingga TypeScript tetap
 * menganggap `node` bisa berupa daun angka dan menolak akses ke `node.text`.
 * Penyempit pada objeknya yang membuat seluruh cabang teks aman diakses.
 */
export function isTextLeaf(node: UndianConditionLeaf): node is UndianTextLeaf {
  return isTextVar(node.var);
}

/**
 * Apakah pohon memuat syarat check-in, jumlah scan, atau checkpoint, yang butuh
 * data pemindaian sesi (checkpoint juga membaca barang yang diserahkan).
 */
export function usesAttendance(node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) return node.children.some(usesAttendance);
  return node.var === "checked_in" || node.var === "scan_count" || isCheckpointVar(node.var) || node.var === "answer";
}

export function isCheckpointVar(value: unknown): value is UndianCheckpointLeaf["var"] {
  return value === "checkpoint_points" || value === "checkpoint_goal" || value === "checkpoints_all";
}

/**
 * Syarat check-in yang menunjuk sesi yang sudah dihapus diganti dengan syarat
 * rusak (selalu salah). Tanpa ini "Belum check-in di <sesi terhapus>" cocok
 * dengan SEMUA orang, karena pemindaian sesi itu ikut terhapus, dan hadiahnya
 * tetap tampil siap. Dijalankan di server, yang tahu daftar sesi acara.
 */
export function invalidateUnknownSessions(node: UndianConditionGroup, known: Set<number>): UndianConditionGroup {
  return {
    ...node,
    children: node.children.map((child): UndianConditionNode => {
      if (isConditionGroup(child)) return invalidateUnknownSessions(child, known);
      if (child.var === "checked_in" && child.session_id !== undefined && !known.has(child.session_id)) return INVALID_LEAF;
      return child;
    }),
  };
}

/** Apakah pohon memuat syarat jawaban form. */
export function usesAnswer(node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) return node.children.some(usesAnswer);
  return node.var === "answer";
}

/**
 * Apakah pohon memuat syarat jawaban form yang pertanyaannya sudah tidak ada di
 * form acara (dihapus, atau Data key-nya diganti). Pada syarat hadiah dan tiket
 * bonus syarat seperti itu gagal tertutup dengan sendirinya. Pada aturan
 * PENGECUALIAN gagal berarti tidak mengecualikan siapa pun, jadi kolam diam-diam
 * melebar; karena itu buildPool menolak mengundi selama aturannya belum dibereskan.
 */
export function hasMissingAnswer(node: UndianConditionNode, known: Set<string>): boolean {
  if (isConditionGroup(node)) return node.children.some((child) => hasMissingAnswer(child, known));
  return node.var === "answer" && !known.has(node.key);
}

/** Apakah pohon memuat syarat yang tidak terbaca. Dipakai layar untuk memperingatkan. */
export function hasInvalidLeaf(node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) return node.children.some(hasInvalidLeaf);
  return node.var === "__invalid";
}

/** Apakah pohon benar-benar tanpa syarat, bukan berisi syarat yang rusak. */
export function isTrulyEmpty(node: UndianConditionGroup): boolean {
  return node.children.length === 0;
}

/**
 * Bentuk syarat datang dari kolom jsonb, jadi tipenya tidak dijamin apa pun.
 *
 * Node yang rusak DIGANTI dengan penanda yang selalu bernilai salah, tidak
 * dijatuhkan. Lihat komentar pada `UndianInvalidLeaf` untuk alasannya — singkatnya,
 * menjatuhkannya mengubah pohon rusak menjadi pohon kosong, dan pohon kosong
 * bernilai benar untuk semua orang.
 */
export function normalizeConditions(value: unknown): UndianConditionGroup {
  if (typeof value !== "object" || value === null) return EMPTY_CONDITIONS;
  const raw = value as Record<string, unknown>;
  const op = raw.op === "or" ? "or" : "and";
  if (!Array.isArray(raw.children)) return { op, children: [] };
  return { op, children: raw.children.map(normalizeNode) };
}

function normalizeNode(value: unknown): UndianConditionNode {
  if (typeof value !== "object" || value === null) return INVALID_LEAF;
  const raw = value as Record<string, unknown>;
  if (raw.op === "and" || raw.op === "or") return normalizeConditions(raw);

  const cmp = raw.cmp;

  if (isTextVar(raw.var)) {
    if (!isTextCmp(cmp)) return INVALID_LEAF;
    const text = typeof raw.text === "string" ? raw.text : "";
    // Pembanding yang butuh nilai tapi nilainya kosong ditandai rusak, bukan
    // dibiarkan lewat. `contains ""` cocok dengan semua orang — dan pada aturan
    // pengecualian itu berarti seluruh ruangan gugur karena satu kolom yang
    // belum diisi.
    if (!TEXT_CMP_WITHOUT_VALUE.includes(cmp) && text.trim() === "") return INVALID_LEAF;
    return { var: raw.var, cmp, text: text.trim() };
  }

  if (raw.var === "answer") {
    const key = typeof raw.key === "string" ? raw.key : "";
    if (!ANSWER_KEY.test(key)) return INVALID_LEAF;
    if (cmp === "in" || cmp === "not_in") {
      if (!Array.isArray(raw.values)) return INVALID_LEAF;
      const values = raw.values.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
      // Sama dengan tipe peserta: daftar kosong belum dipilih, bukan "siapa pun".
      if (values.length === 0) return INVALID_LEAF;
      return { var: "answer", key, cmp, values };
    }
    if (!isTextCmp(cmp)) return INVALID_LEAF;
    const text = typeof raw.text === "string" ? raw.text : "";
    if (!TEXT_CMP_WITHOUT_VALUE.includes(cmp) && text.trim() === "") return INVALID_LEAF;
    return { var: "answer", key, cmp, text: text.trim() };
  }

  switch (raw.var) {
    case "total_spend":
    case "booth_count":
    case "scan_count":
    case "checkpoint_points": {
      if (!isCmp(cmp)) return INVALID_LEAF;
      const numeric = Number(raw.value);
      if (!Number.isFinite(numeric)) return INVALID_LEAF;
      return { var: raw.var, cmp, value: numeric };
    }
    case "participant_type":
    case "rsvp_status": {
      if (cmp !== "in" && cmp !== "not_in") return INVALID_LEAF;
      if (!Array.isArray(raw.values)) return INVALID_LEAF;
      const values = raw.values.filter((item): item is string => typeof item === "string" && item.trim() !== "");
      // Daftar kosong pada `not_in` akan cocok dengan SEMUA orang, dan pada `in`
      // dengan tidak seorang pun. Keduanya bukan maksud siapa pun; ini adalah
      // syarat yang baru ditambahkan dan belum dipilih nilainya.
      if (values.length === 0) return INVALID_LEAF;
      return { var: raw.var, cmp, values };
    }
    case "checked_in": {
      const sessionId = Number(raw.session_id);
      return Number.isInteger(sessionId) && sessionId > 0
        ? { var: "checked_in", is: raw.is !== false, session_id: sessionId }
        : { var: "checked_in", is: raw.is !== false };
    }
    case "has_seat":
    case "checkpoint_goal":
    case "checkpoints_all":
      return { var: raw.var, is: raw.is !== false };
    default:
      return INVALID_LEAF;
  }
}

function isCmp(value: unknown): value is UndianCmp {
  return value === "gte" || value === "gt" || value === "lte" || value === "lt" || value === "eq";
}

function isTextCmp(value: unknown): value is UndianTextCmp {
  return typeof value === "string" && value in TEXT_CMP_LABEL;
}

function compare(actual: number, cmp: UndianCmp, expected: number): boolean {
  switch (cmp) {
    case "gte": return actual >= expected;
    case "gt": return actual > expected;
    case "lte": return actual <= expected;
    case "lt": return actual < expected;
    case "eq": return actual === expected;
  }
}

/**
 * Bandingkan teks, mengabaikan besar kecil huruf dan spasi di ujung.
 *
 * Nilai NULL diperlakukan sebagai string kosong, bukan sebagai "gagal semua
 * pembanding". Dengan begitu `neq "PT PRIMA"` tetap bernilai benar untuk peserta
 * yang perusahaannya belum terisi — yang memang benar, ia bukan dari PT PRIMA.
 * Kalau NULL menggagalkan semua pembanding, aturan negatif akan bocor tepat pada
 * baris yang datanya paling tidak lengkap.
 */
function compareText(actual: string | null, cmp: UndianTextCmp, expected: string): boolean {
  const a = (actual ?? "").trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  switch (cmp) {
    case "eq": return a === b;
    case "neq": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "is_empty": return a === "";
    case "is_not_empty": return a !== "";
  }
}

// ---------------------------------------------------------------------------
// Kolam peserta
// ---------------------------------------------------------------------------

/** Satu baris keluaran RPC `undian_participant_pool`. */
export type ParticipantPoolRow = {
  participant_id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
  participant_type: string | null;
  rsvp_status: string | null;
  /** Sudah check-in di sesi mana pun, termasuk salinan scanner API. */
  checked_in: boolean;
  /**
   * Sesi kehadiran tempat peserta pernah dipindai. Diisi server (lihat
   * loadParticipantPool) hanya bila ada syarat check-in; tanpa itu kosong.
   */
  attended_sessions?: number[];
  /**
   * Salinan scanner API ditambah jumlah sesi tempat peserta dipindai lewat /scan.
   * Pindaian ulang di sesi yang sama tidak ikut, supaya bobot tidak naik hanya
   * karena seseorang dipindai dua kali di pintu yang sama.
   */
  scan_count: number;
  /**
   * Checkpoint, diisi server bersama `attended_sessions` (lihat
   * loadParticipantPool). Kosong dibaca sebagai 0 poin dan belum selesai.
   */
  checkpoint_points?: number;
  checkpoint_goal_met?: boolean;
  checkpoints_all_done?: boolean;
  /**
   * Jawaban pertanyaan form per kunci, sebagai teks (answerText). Diisi server
   * bersama `attended_sessions`; hanya kunci pertanyaan yang masih ada.
   */
  answers?: Record<string, string>;
  seat_label: string | null;
  allow_name_display: boolean;
  total_spend: number;
  booth_count: number;
  /** Berapa kali peserta ini sudah menang (status rejected tidak dihitung). */
  already_won: number;
  /** Ada di daftar pengecualian per orang. */
  manually_excluded: boolean;
  /** Alasan yang ditulis panitia saat mengecualikan. */
  exclusion_reason: string | null;
};

/**
 * Apakah satu peserta memenuhi pohon syarat.
 *
 * Grup kosong LOLOS. Hadiah tanpa syarat harus terbuka untuk semua; kalau grup
 * kosong dianggap gagal, hadiah yang baru dibuat akan punya kolam nol dan
 * penyebabnya tidak terlihat di mana pun.
 *
 * Perhatikan bahwa fungsi ini tidak tahu arah pemakaiannya. Pada syarat hadiah
 * `true` berarti boleh ikut; pada aturan pengecualian `true` berarti tersingkir.
 * Karena itu grup kosong pada aturan pengecualian akan mengecualikan semua orang —
 * dan justru itu sebabnya CHECK constraint di database menolak aturan tanpa syarat,
 * bukan fungsi ini yang menebak maksudnya.
 *
 * Variabel yang tidak dikenal GAGAL, bukan lolos. Salah tulis konfigurasi harus
 * mempersempit kolam sehingga langsung terlihat di angka pratinjau, bukan diam-diam
 * membuka undian untuk seluruh ruangan.
 */
export function matchesConditions(row: ParticipantPoolRow, node: UndianConditionNode): boolean {
  if (isConditionGroup(node)) {
    if (node.children.length === 0) return true;
    return node.op === "and"
      ? node.children.every((child) => matchesConditions(row, child))
      : node.children.some((child) => matchesConditions(row, child));
  }

  switch (node.var) {
    // Syarat yang tidak terbaca SELALU salah. Kalau ia lolos, salah tulis
    // konfigurasi akan diam-diam membuka undian untuk seluruh ruangan pada syarat
    // hadiah, atau menggugurkan semua orang pada aturan pengecualian.
    case "__invalid": return false;
    case "total_spend": return compare(row.total_spend, node.cmp, node.value);
    case "booth_count": return compare(row.booth_count, node.cmp, node.value);
    case "scan_count": return compare(row.scan_count, node.cmp, node.value);
    case "checkpoint_points": return compare(row.checkpoint_points ?? 0, node.cmp, node.value);
    case "checkpoint_goal": return (row.checkpoint_goal_met ?? false) === node.is;
    case "checkpoints_all": return (row.checkpoints_all_done ?? false) === node.is;
    case "answer": {
      if (!row.answers || !Object.hasOwn(row.answers, node.key)) return false;
      const value = row.answers[node.key];
      if ("values" in node) {
        const inList = node.values.includes(value.trim());
        return node.cmp === "in" ? inList : !inList;
      }
      return compareText(value, node.cmp, node.text);
    }
    case "participant_type": {
      const inList = node.values.includes(row.participant_type ?? "");
      return node.cmp === "in" ? inList : !inList;
    }
    case "rsvp_status": {
      const inList = node.values.includes(row.rsvp_status ?? "");
      return node.cmp === "in" ? inList : !inList;
    }
    case "checked_in": return (node.session_id === undefined
      ? row.checked_in
      : (row.attended_sessions ?? []).includes(node.session_id)) === node.is;
    case "has_seat": return Boolean(row.seat_label) === node.is;
    // `job_title` dipetakan ke kolom `title`. Namanya dibedakan di sisi aturan
    // karena "title" sendirian ambigu — di layar admin ia mudah terbaca sebagai
    // judul, bukan jabatan.
    case "name": return compareText(row.name, node.cmp, node.text);
    case "company": return compareText(row.company, node.cmp, node.text);
    case "job_title": return compareText(row.title, node.cmp, node.text);
    case "qr_code": return compareText(row.qr_code, node.cmp, node.text);
    case "seat_label": return compareText(row.seat_label, node.cmp, node.text);
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Bobot
// ---------------------------------------------------------------------------

/**
 * `equal` = semua satu tiket. `bonus` = tiket tambahan per aturan. `formula`
 * = rumus lama (base + nilai ÷ pembagi); hanya untuk hadiah yang sudah
 * memakainya, layar tidak menawarkannya untuk hadiah lain.
 */
export type WeightMode = "equal" | "formula" | "bonus";
export type WeightVar = "total_spend" | "booth_count" | "scan_count";

/**
 * Satu aturan tiket tambahan. Sumbernya daftar dari panitia (sudah dicocokkan
 * ke id peserta saat diupload) atau pohon syarat dari data acara.
 */
export type BonusRule =
  | { name: string; tickets: number; source: "list"; participant_ids: string[]; file_name: string | null; uploaded_at: string | null }
  | { name: string; tickets: number; source: "conditions"; conditions: UndianConditionGroup };

export const BONUS_TICKETS_MAX = 100;
export const BONUS_RULES_MAX = 20;
export const BONUS_LIST_MAX = 5000;

export type WeightConfig = {
  weight_mode: WeightMode;
  weight_var: WeightVar;
  weight_divisor: number;
  weight_base: number;
  weight_max: number;
  /** Hanya dipakai saat weight_mode = "bonus". */
  bonus_rules?: BonusRule[];
};

export const WEIGHT_VAR_LABEL: Record<WeightVar, string> = {
  total_spend: "Total spend",
  booth_count: "Booths visited",
  scan_count: "Scan count",
};

/**
 * Jumlah tiket seorang peserta.
 *
 * tiket = base + floor(nilai / pembagi), lalu dijepit ke [1, max].
 *
 * Batas bawahnya 1, bukan 0, walau base boleh 0. Peserta yang sudah lolos SYARAT
 * tapi berakhir dengan nol tiket adalah keadaan yang mustahil dijelaskan: ia ada
 * di daftar, namanya ikut berputar di roda, tetapi peluangnya nol. Kalau seseorang
 * memang tidak boleh menang, tempatnya di syarat atau di daftar pengecualian, bukan
 * di bobot.
 *
 * Batas atasnya wajib. Tanpa itu, satu peserta dengan belanja jauh di atas
 * rata-rata memegang mayoritas tiket dan undian berhenti terasa seperti undian
 * bagi semua orang lain di ruangan.
 */
export function ticketsFor(row: ParticipantPoolRow, config: WeightConfig): number {
  if (config.weight_mode === "equal") return 1;
  if (config.weight_mode === "bonus") {
    const extra = matchingBonusRules(row, config.bonus_rules ?? []).reduce((sum, index) => sum + (config.bonus_rules ?? [])[index].tickets, 0);
    return Math.max(1, Math.min(config.weight_max, 1 + extra));
  }
  const source = config.weight_var === "total_spend" ? row.total_spend
    : config.weight_var === "booth_count" ? row.booth_count
    : row.scan_count;
  const divisor = config.weight_divisor > 0 ? config.weight_divisor : 1;
  const tickets = config.weight_base + Math.floor(source / divisor);
  return Math.max(1, Math.min(config.weight_max, tickets));
}

// Daftar id per aturan disimpan sebagai Set sekali saja. Tanpa ini setiap
// peserta memindai seluruh daftar, dan 2.000 peserta x daftar 2.000 nama
// berjalan di setiap pratinjau.
const bonusSets = new WeakMap<BonusRule, Set<string>>();

/** Indeks aturan tiket tambahan yang cocok untuk satu peserta, berurutan. */
export function matchingBonusRules(row: ParticipantPoolRow, rules: BonusRule[]): number[] {
  const hits: number[] = [];
  rules.forEach((rule, index) => {
    if (rule.source === "list") {
      let set = bonusSets.get(rule);
      if (!set) { set = new Set(rule.participant_ids); bonusSets.set(rule, set); }
      if (set.has(row.participant_id)) hits.push(index);
      return;
    }
    // Pohon kosong bernilai benar. Di sini benar berarti SEMUA orang dapat tiket
    // tambahan, yang sama saja dengan tidak memberi siapa pun kelebihan; aturan
    // setengah jadi seperti itu dianggap tidak cocok dengan siapa pun.
    if (isTrulyEmpty(rule.conditions)) return;
    if (matchesConditions(row, rule.conditions)) hits.push(index);
  });
  return hits;
}

/** Bentuk aman dari kolom bonus_rules. Baris yang rusak dibuang, bukan ditebak. */
export function normalizeBonusRules(value: unknown): BonusRule[] {
  if (!Array.isArray(value)) return [];
  const rules: BonusRule[] = [];
  for (const item of value.slice(0, BONUS_RULES_MAX)) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name : "";
    const tickets = Math.max(1, Math.min(BONUS_TICKETS_MAX, Math.round(Number(raw.tickets) || 1)));
    if (raw.source === "list") {
      const ids = Array.isArray(raw.participant_ids) ? raw.participant_ids.filter((id): id is string => typeof id === "string") : [];
      rules.push({
        name, tickets, source: "list", participant_ids: ids,
        file_name: typeof raw.file_name === "string" ? raw.file_name : null,
        uploaded_at: typeof raw.uploaded_at === "string" ? raw.uploaded_at : null,
      });
    } else if (raw.source === "conditions") {
      rules.push({ name, tickets, source: "conditions", conditions: normalizeConditions(raw.conditions) });
    }
  }
  return rules;
}

/** Aturan tiket tambahan dengan sesi check-in yang sudah dihapus dibuat tidak cocok. */
export function invalidateBonusSessions(rules: BonusRule[], known: Set<number>): BonusRule[] {
  return rules.map((rule) => rule.source === "conditions" ? { ...rule, conditions: invalidateUnknownSessions(rule.conditions, known) } : rule);
}

// ---------------------------------------------------------------------------
// Kandidat dan pemilihan
// ---------------------------------------------------------------------------

/**
 * Satu nama di kolam, sudah bebas dari asal-usulnya.
 *
 * Peserta terdaftar dan entri hasil import dinormalkan ke bentuk yang sama supaya
 * mesin pemilihan, layar panggung, dan pencatatan pemenang tidak perlu tahu
 * datanya berasal dari mana.
 */
export type Candidate = {
  kind: "participant" | "entry";
  /** uuid peserta, atau id baris entri sebagai string. */
  ref: string;
  name: string;
  company: string | null;
  seat: string | null;
  code: string | null;
  tickets: number;
};

export function participantToCandidate(row: ParticipantPoolRow, config: WeightConfig): Candidate {
  return {
    kind: "participant",
    ref: row.participant_id,
    name: row.name,
    company: row.company,
    seat: row.seat_label,
    code: row.qr_code,
    tickets: ticketsFor(row, config),
  };
}

/**
 * Bilangan bulat acak 0..max-1 dengan penolakan (rejection sampling).
 *
 * Memakai crypto, bukan Math.random(). Bukan karena Math.random() dapat ditebak
 * dalam praktik di sisi server, melainkan karena hasil undian ini menentukan siapa
 * membawa pulang hadiah dan pertanyaannya pasti muncul. "Memakai generator acak
 * kriptografis" adalah jawaban yang bisa diperiksa; "cukup acak" bukan.
 *
 * Sisa pembagian sederhana (% max) ditolak karena membuat nilai-nilai awal
 * sedikit lebih sering muncul. Biasnya kecil, tetapi tidak ada alasan menerimanya
 * ketika menghindarinya hanya butuh satu putaran pengulangan.
 */
function randomBelow(max: number): number {
  if (max <= 1) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

/**
 * Ambil `count` pemenang TANPA pengembalian, dengan menghormati bobot.
 *
 * Tanpa pengembalian selalu, tidak dapat disetel. Satu orang yang memenangkan
 * hadiah yang sama dua kali dalam satu putaran adalah hasil yang benar secara
 * matematis dan mustahil dipertahankan di atas panggung.
 *
 * Memakai jumlah kumulatif, bukan larik tiket yang direntang. Dengan 250 peserta
 * dan batas 1000 tiket, versi rentang dapat membuat larik 250.000 elemen untuk
 * mengambil satu nama.
 *
 * Bila diminta lebih banyak daripada isi kolam, yang dikembalikan adalah seluruh
 * kolam. Pemanggil bertanggung jawab memutuskan apakah itu masalah — di panggung,
 * lima pemenang dari kolam berisi tiga orang lebih baik daripada nol pemenang
 * disertai pesan galat.
 */
export function drawWinners(pool: Candidate[], count: number): Candidate[] {
  const remaining = [...pool];
  const winners: Candidate[] = [];
  const target = Math.min(count, remaining.length);

  for (let picked = 0; picked < target; picked += 1) {
    const total = remaining.reduce((sum, candidate) => sum + Math.max(1, candidate.tickets), 0);
    let cursor = randomBelow(total);
    let index = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      cursor -= Math.max(1, remaining[i].tickets);
      if (cursor < 0) { index = i; break; }
      index = i;
    }
    winners.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return winners;
}

/** Fisher-Yates, dipakai layar panggung untuk mengacak urutan nama yang berputar. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hadiah dan state
// ---------------------------------------------------------------------------

export type UndianAnimation = "wheel" | "slot" | "cards" | "digits" | "dart" | "instant";

export type SpinMode = "timed" | "manual";

export const SPIN_MODES: { value: SpinMode; label: string; hint: string }[] = [
  { value: "timed", label: "Fixed duration", hint: "The animation stops automatically after the set time. Useful for a tight schedule." },
  { value: "manual", label: "Manual stop", hint: "The animation keeps spinning until the operator presses Stop. Useful for a main prize when the MC wants to hold the moment." },
];

export const ANIMATIONS: { value: UndianAnimation; label: string; hint: string }[] = [
  { value: "wheel", label: "Spinning wheel", hint: "Familiar to audiences. Works well with up to around 200 names." },
  { value: "slot", label: "Slot machine", hint: "Names scroll quickly, then stop. Works well with hundreds or thousands of names." },
  { value: "cards", label: "Card reveal", hint: "Cards are revealed one at a time. Best for several winners in one draw." },
  { value: "digits", label: "Digit reveal", hint: "Seat numbers or codes appear digit by digit to build suspense." },
  { value: "dart", label: "Dart throw", hint: "Draw slips float, then a dart lands on the winner. Most lively on a large screen." },
  { value: "instant", label: "Instant reveal", hint: "No animation. A fallback when time is short." },
];

export type PrizeSource = "participants" | "entries";
export type ExcludeScope = "none" | "this_prize" | "all_prizes";

export const EXCLUDE_SCOPE_LABEL: Record<ExcludeScope, string> = {
  none: "Can win multiple times",
  this_prize: "Cannot win this prize twice",
  all_prizes: "Excluded from all prizes after winning once",
};

export type UndianPrize = {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  sponsor_name: string | null;
  winners_per_draw: number;
  winner_quota: number;
  backup_per_draw: number;
  animation: UndianAnimation;
  /**
   * `manual` membuat animasi berputar sampai operator menekan Berhenti.
   *
   * Teknisnya: `draw` tidak mengisi `reveal_at`, dan seluruh rantai di
   * hilirnya sudah memperlakukan NULL sebagai "belum waktunya" -- lihat
   * `revealDue` di /api/undian/state dan `endsAt` di undian-animations.
   */
  spin_mode: SpinMode;
  spin_seconds: number;
  source: PrizeSource;
  entry_group_id: number | null;
  conditions: UndianConditionGroup;
  exclude_scope: ExcludeScope;
  weight_mode: WeightMode;
  weight_var: WeightVar;
  weight_divisor: number;
  weight_base: number;
  weight_max: number;
  bonus_rules: BonusRule[];
  sort_order: number;
  is_active: boolean;
};

/**
 * `numeric` di Postgres diserialkan menjadi string oleh driver supaya presisinya
 * tidak hilang, jadi angka mentahnya tidak bisa langsung dipakai berhitung. Kalau
 * normalisasi ini terlewat, slider durasi putaran akan melompat ke nilai bawaan
 * pada render pertama — persis masalah yang sama dengan skala branding.
 */
export function normalizePrize(raw: Record<string, unknown>): UndianPrize {
  const numeric = (value: unknown, fallback: number) => {
    const parsed = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null) ?? null,
    image_url: (raw.image_url as string | null) ?? null,
    sponsor_name: (raw.sponsor_name as string | null) ?? null,
    winners_per_draw: numeric(raw.winners_per_draw, 1),
    winner_quota: numeric(raw.winner_quota, 1),
    backup_per_draw: numeric(raw.backup_per_draw, 0),
    animation: (ANIMATIONS.some((item) => item.value === raw.animation) ? raw.animation : "wheel") as UndianAnimation,
    spin_mode: raw.spin_mode === "manual" ? "manual" : "timed",
    spin_seconds: numeric(raw.spin_seconds, 6),
    source: raw.source === "entries" ? "entries" : "participants",
    entry_group_id: raw.entry_group_id == null ? null : Number(raw.entry_group_id),
    conditions: normalizeConditions(raw.conditions),
    exclude_scope: (raw.exclude_scope === "none" || raw.exclude_scope === "this_prize" ? raw.exclude_scope : "all_prizes") as ExcludeScope,
    weight_mode: raw.weight_mode === "formula" || raw.weight_mode === "bonus" ? raw.weight_mode : "equal",
    weight_var: (raw.weight_var === "booth_count" || raw.weight_var === "scan_count" ? raw.weight_var : "total_spend") as WeightVar,
    weight_divisor: numeric(raw.weight_divisor, 500000),
    weight_base: numeric(raw.weight_base, 1),
    weight_max: numeric(raw.weight_max, 10),
    bonus_rules: normalizeBonusRules(raw.bonus_rules),
    sort_order: numeric(raw.sort_order, 0),
    is_active: raw.is_active !== false,
  };
}

/**
 * Hadiah untuk audit_logs. Daftar id peserta pada aturan tiket tambahan diganti
 * jumlahnya: daftar 5.000 nama ditulis dua kali (sebelum dan sesudah) pada
 * setiap simpan akan menenggelamkan riwayat, padahal yang perlu terbaca adalah
 * siapa mengubah aturan apa.
 */
export function auditPrize(prize: UndianPrize) {
  return {
    ...prize,
    bonus_rules: prize.bonus_rules.map((rule) => rule.source === "list"
      ? { name: rule.name, tickets: rule.tickets, source: rule.source, participant_count: rule.participant_ids.length, file_name: rule.file_name, uploaded_at: rule.uploaded_at }
      : rule),
  };
}

export type UndianPhase = "idle" | "spinning" | "revealed";
export type UndianMode = "off" | "live";

/** Satu pemenang seperti yang dikirim ke layar. */
export type UndianWinner = {
  id?: number;
  ref: string;
  kind: "participant" | "entry";
  name: string;
  company: string | null;
  seat: string | null;
  is_backup: boolean;
  slot_order: number;
  status?: "pending" | "confirmed" | "rejected";
};

/**
 * Bentuk response GET /api/undian/state.
 *
 * `winners` HANYA terisi setelah waktu reveal lewat. Selama fase spinning ia
 * kosong, dan itu bukan penyederhanaan melainkan syarat kerahasiaan: lihat
 * komentar pada kolom `pending` di migrasi.
 */
export type UndianState = {
  mode: UndianMode;
  /**
   * true = undian sedang dijalankan sebagai LATIHAN. Hasilnya tidak dicatat.
   *
   * Wajib ikut ke layar panggung, bukan hanya dipakai server. Gladi bersih
   * biasanya dijalankan dengan layar sungguhan menyala di ruangan yang sudah
   * ada orangnya; tanpa penanda di layar, nama yang muncul tidak dapat
   * dibedakan dari pemenang sungguhan oleh siapa pun yang kebetulan melihat.
   */
  rehearsal: boolean;
  phase: UndianPhase;
  draw_round: number;
  prize: {
    id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    sponsor_name: string | null;
    animation: UndianAnimation;
    spin_seconds: number;
    winners_per_draw: number;
    winner_quota: number;
  } | null;
  /** Nama-nama untuk animasi. Aman: berisi SELURUH kolam, tidak menunjukkan siapa pemenangnya. */
  roster: { name: string; seat: string | null; code: string | null }[];
  pool_size: number;
  spin_started_at: string | null;
  reveal_at: string | null;
  winners: UndianWinner[];
  /** Pemenang yang sudah dikonfirmasi untuk hadiah aktif, untuk papan rekap. */
  confirmed: UndianWinner[];
  settings: UndianDisplaySettings;
  updated_at: string;
};

export type UndianDisplaySettings = {
  page_title: string;
  page_subtitle: string | null;
  show_company: boolean;
  show_seat: boolean;
  sound_enabled: boolean;
  confetti_enabled: boolean;
  background_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  background_image_url: string | null;
};

// ---------------------------------------------------------------------------
// Ringkasan syarat untuk daftar hadiah
// ---------------------------------------------------------------------------

const CMP_TEXT: Record<UndianCmp, string> = {
  gte: "at least", gt: "more than", lte: "at most", lt: "less than", eq: "exactly",
};

const rupiah = (value: number) => `Rp ${new Intl.NumberFormat("en-GB").format(value)}`;

/** Satu baris ringkas, supaya admin tidak perlu membuka form hanya untuk tahu syaratnya. */
/**
 * `sessionNames` null = daftar sesi gagal dimuat; sesi yang dipilih lalu disebut
 * "sesi tertentu", bukan "sudah dihapus".
 */
/**
 * `answerLabels`: judul pertanyaan per kunci. Tanpa daftar, kuncinya yang
 * disebut; dengan daftar, kunci yang tidak ada di sana berarti sudah dihapus.
 */
export function describeConditions(node: UndianConditionGroup, sessionNames: Record<number, string> | null = {}, answerLabels?: Record<string, string>): string {
  if (node.children.length === 0) return "all active participants";

  const parts = node.children.map((child) => {
    if (isConditionGroup(child)) return `(${describeConditions(child, sessionNames, answerLabels)})`;
    if (isTextLeaf(child)) {
      const label = TEXT_VAR_LABEL[child.var].toLowerCase();
      if (TEXT_CMP_WITHOUT_VALUE.includes(child.cmp)) return `${label} ${TEXT_CMP_LABEL[child.cmp]}`;
      return `${label} ${TEXT_CMP_LABEL[child.cmp]} "${child.text}"`;
    }
    switch (child.var) {
      // Disebut apa adanya, tidak disembunyikan. Syarat yang tidak terbaca membuat
      // seluruh aturan tidak pernah terpenuhi, dan panitia harus melihatnya di
      // daftar tanpa perlu membuka form.
      case "__invalid": return "UNREADABLE CONDITION";
      case "total_spend": return `spend ${CMP_TEXT[child.cmp]} ${rupiah(child.value)}`;
      case "booth_count": return `${CMP_TEXT[child.cmp]} ${child.value} booth visits`;
      case "scan_count": return `${CMP_TEXT[child.cmp]} ${child.value} scans`;
      case "checkpoint_points": return `checkpoint points ${CMP_TEXT[child.cmp]} ${child.value}`;
      case "checkpoint_goal": return child.is ? "checkpoint points goal reached" : "checkpoint points goal not reached";
      case "checkpoints_all": return child.is ? "all checkpoints done" : "not all checkpoints done";
      case "answer": {
        if (answerLabels && answerLabels[child.key] === undefined) return "FORM QUESTION DELETED, choose again";
        const label = answerLabels?.[child.key] ?? child.key;
        if ("values" in child) return `${label} ${child.cmp === "in" ? "is" : "is not"} ${child.values.join("/")}`;
        if (TEXT_CMP_WITHOUT_VALUE.includes(child.cmp)) return `${label} ${TEXT_CMP_LABEL[child.cmp]}`;
        return `${label} ${TEXT_CMP_LABEL[child.cmp]} "${child.text}"`;
      }
      case "participant_type": return `participant type ${child.cmp === "in" ? "" : "not "}${child.values.join("/")}`;
      case "rsvp_status": return `RSVP ${child.cmp === "in" ? "" : "not "}${child.values.join("/")}`;
      case "checked_in": {
        const status = child.is ? "checked in" : "not checked in";
        if (child.session_id === undefined) return status;
        if (sessionNames === null) return `${status} at a particular session`;
        // Sesi terhapus disebut keras, seperti syarat rusak: syaratnya tidak
        // pernah terpenuhi sampai sesinya dipilih ulang.
        return sessionNames[child.session_id] === undefined
          ? "CHECK-IN SESSION DELETED, choose again"
          : `${status} at ${sessionNames[child.session_id]}`;
      }
      case "has_seat": return child.is ? "has a seat" : "no seat";
      default: return "unknown condition";
    }
  });

  return parts.join(node.op === "and" ? " and " : " or ");
}

// ---------------------------------------------------------------------------
// Aturan pengecualian
// ---------------------------------------------------------------------------

/**
 * Satu aturan pengecualian.
 *
 * Peserta yang MEMENUHI `conditions` justru dikecualikan. Arahnya berlawanan
 * dengan `UndianPrize.conditions`, dan itu sebabnya keduanya disimpan di tabel
 * berbeda meski bentuk pohonnya sama.
 */
export type UndianExclusionRule = {
  id: number;
  name: string;
  note: string | null;
  conditions: UndianConditionGroup;
  /** null = berlaku untuk semua hadiah. */
  prize_id: number | null;
  is_active: boolean;
};

export function normalizeExclusionRule(raw: Record<string, unknown>): UndianExclusionRule {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    note: (raw.note as string | null) ?? null,
    conditions: normalizeConditions(raw.conditions),
    prize_id: raw.prize_id == null ? null : Number(raw.prize_id),
    is_active: raw.is_active !== false,
  };
}

/**
 * Rincian mengapa kolam menyusut.
 *
 * Satu angka akhir ("229 nama siap diundi") tidak dapat diperiksa siapa pun.
 * Yang bisa diperiksa adalah selisihnya: 249 peserta, 12 kena aturan, 3
 * dikecualikan manual, 5 tidak memenuhi syarat hadiah, 4 sudah pernah menang.
 * Kalau salah satu angka itu mengejutkan, panitia tahu di mana harus melihat —
 * sebelum acara, bukan sesudah nama yang salah keluar.
 */
export type PoolBreakdown = {
  total: number;
  /** Tidak memenuhi syarat hadiah. */
  failed_conditions: number;
  /** Kena salah satu aturan pengecualian. */
  by_rules: number;
  /** Ada di daftar pengecualian per orang. */
  by_manual: number;
  /** Sudah pernah menang, sesuai cakupan exclude_scope hadiah. */
  by_previous_wins: number;
  /** Nama per aturan yang benar-benar menyingkirkan seseorang. */
  rule_hits: { rule_id: number; rule_name: string; count: number }[];
};

// ---------------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------------

export type UndianSessionStatus = "active" | "closed";

/**
 * Satu sesi undian.
 *
 * Hanya SATU sesi boleh berstatus `active` pada satu waktu; aturan itu ditegakkan
 * oleh unique index parsial di database, bukan hanya oleh route handler.
 */
export type UndianSession = {
  id: number;
  name: string;
  note: string | null;
  status: UndianSessionStatus;
  started_at: string;
  closed_at: string | null;
};

/** Baris keluaran RPC `undian_session_summary`. */
export type UndianSessionSummary = UndianSession & {
  closed_by_username: string | null;
  prize_count: number;
  draw_count: number;
  winner_total: number;
  winner_confirmed: number;
  winner_pending: number;
  winner_rejected: number;
  first_draw_at: string | null;
  last_draw_at: string | null;
};

/**
 * `count(...)` di Postgres bertipe `bigint` dan diserialkan sebagai STRING oleh
 * driver, sama seperti kolom `numeric`. Tanpa normalisasi ini, "10" + 1 di sisi
 * klien menghasilkan "101".
 */
export function normalizeSessionSummary(raw: Record<string, unknown>): UndianSessionSummary {
  const num = (value: unknown) => {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    id: Number(raw.session_id ?? raw.id),
    name: String(raw.name ?? ""),
    note: (raw.note as string | null) ?? null,
    status: raw.status === "closed" ? "closed" : "active",
    started_at: String(raw.started_at ?? ""),
    closed_at: (raw.closed_at as string | null) ?? null,
    closed_by_username: (raw.closed_by_username as string | null) ?? null,
    prize_count: num(raw.prize_count),
    draw_count: num(raw.draw_count),
    winner_total: num(raw.winner_total),
    winner_confirmed: num(raw.winner_confirmed),
    winner_pending: num(raw.winner_pending),
    winner_rejected: num(raw.winner_rejected),
    first_draw_at: (raw.first_draw_at as string | null) ?? null,
    last_draw_at: (raw.last_draw_at as string | null) ?? null,
  };
}

export const WINNER_STATUS_LABEL: Record<"pending" | "confirmed" | "rejected", string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Cancelled",
};
